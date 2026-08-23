"""Commerce service — referral rewards, loyalty crediting."""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer, ReferralEvent
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.core.business_time import BUSINESS_TZ

logger = logging.getLogger(__name__)


async def _recalculate_tier(db: AsyncSession, account: LoyaltyAccount):
    """Auto-upgrade tier based on rolling 12-month eligible spend.

    Per the Loka Espresso loyalty program structure, tier qualification is
    spend-based (RM500 → Origin, RM1500 → Reserve within a rolling 12-month
    window), not points-based. This function only PROMOTES — renewal review
    and downgrades are handled by `_evaluate_tier_renewal`. annual_spend is
    stored in integer minor units (sen); tier thresholds are RM."""
    result = await db.execute(
        select(LoyaltyTier).where(LoyaltyTier.is_active.is_(True)).order_by(LoyaltyTier.sort_order.desc())
    )
    tiers = result.scalars().all()
    if not tiers:
        return
    best = tiers[-1]  # lowest tier as fallback
    for t in tiers:
        threshold_sen = (t.renewal_annual_spend or 0) * 100
        if (account.annual_spend or 0) >= threshold_sen:
            best = t
            break
    if account.current_tier_id != best.id:
        current = next((t for t in tiers if t.id == account.current_tier_id), None)
        # Promote only — never demote here (renewal review owns downgrades)
        if current is None or best.sort_order > current.sort_order:
            account.current_tier_id = best.id
            account.last_tier_change_at = datetime.now(timezone.utc)
            # Transactional notification (savepoint-isolated, never blocks).
            from app.services.transactional_notifications import notify_event
            try:
                multiplier = float(best.points_multiplier or 1)
                await notify_event(
                    db, "tier_upgrade", account.customer_id,
                    context={
                        "tier_name": best.name or "a new tier",
                        "multiplier": f"{multiplier:g}×",
                    },
                    entity_type="tier", entity_id=best.id,
                )
            except Exception:
                logger.exception("tier_upgrade notification failed for account %s", account.id)


async def _birthday_points_multiplier(db: AsyncSession, customer_id: int) -> Decimal:
    """Double points during the customer's birthday month (all tiers, per program)."""
    from app.models.customer import Customer
    result = await db.execute(
        select(Customer.date_of_birth).where(Customer.id == customer_id)
    )
    dob = result.scalar_one_or_none()
    # Business-local month: at MYT month boundaries UTC lags/leads by hours.
    if dob and dob.month == datetime.now(BUSINESS_TZ).month:
        return Decimal(2)
    return Decimal(1)


async def grant_voucher_to_customer(
    db: AsyncSession,
    customer_id: int,
    voucher_code: str,
    source: str,
    source_id: int | None = None,
    expires_at: datetime | None = None,
):
    """Create a CustomerVoucher instance from a definition (shared by welcome
    reward and birthday perks). Returns the CustomerVoucher or None."""
    import secrets as _secrets
    from app.models.store import Store
    from app.models.voucher import CustomerVoucher, VoucherDefinition

    result = await db.execute(
        select(VoucherDefinition).where(
            VoucherDefinition.voucher_code == voucher_code,
            VoucherDefinition.deleted_at.is_(None),
            VoucherDefinition.is_active.is_(True),
        )
    )
    vd = result.scalar_one_or_none()
    if vd is None:
        return None
    store_result = await db.execute(
        select(Store.id).where(Store.deleted_at.is_(None), Store.is_active.is_(True)).limit(1)
    )
    store_id = store_result.scalar_one_or_none()
    if store_id is None:
        return None
    now = datetime.now(timezone.utc)
    if expires_at is None:
        expires_at = now + timedelta(days=vd.validity_days or 30)
    snapshot = {
        "voucher_code": vd.voucher_code,
        "voucher_type": str(vd.voucher_type),
        "display_title": vd.display_title,
        "description": vd.description,
        "discount_value": float(vd.discount_value or 0),
        "discount_max_amount": float(vd.discount_max_amount) if vd.discount_max_amount is not None else None,
        "minimum_order_value": float(vd.minimum_order_value or 0),
    }
    cv = CustomerVoucher(
        customer_id=customer_id,
        voucher_definition_id=vd.id,
        store_id=store_id,
        source=source,
        source_id=source_id,
        voucher_code=f"{voucher_code.split('-')[0]}-{_secrets.token_hex(4).upper()}",
        status="active",
        voucher_snapshot=snapshot,
        expires_at=expires_at,
    )
    db.add(cv)
    await db.flush()
    # Transactional notification (template-driven, never blocks the grant).
    from app.services.transactional_notifications import notify_event
    discount = ""
    if vd.voucher_type in ("percentage_discount", "fixed_amount_off", "fixed_discount"):
        discount = f"{float(vd.discount_value or 0):g}"
        discount = (f"{discount}% off" if vd.voucher_type == "percentage_discount" else f"RM {discount} off")
    elif vd.voucher_type == "free_delivery":
        discount = "Free delivery"
    await notify_event(
        db, "voucher_granted", customer_id,
        context={"voucher_title": vd.display_title or vd.voucher_code, "discount": discount},
        entity_type="customer_voucher", entity_id=cv.id,
    )
    return cv


async def grant_birthday_perk(db: AsyncSession, customer_id: int, tier_key: str | None) -> None:
    """Grant the tier-appropriate birthday perk voucher once per calendar year.

    Per the program structure: Origin → complimentary drink upgrade,
    Reserve → exclusive birthday gift. Bloom gets double points only.
    """
    from app.models.customer import Customer
    from app.models.voucher import CustomerVoucher

    if tier_key not in ("origin", "reserve"):
        return
    result = await db.execute(
        select(Customer.date_of_birth).where(Customer.id == customer_id)
    )
    dob = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not dob or dob.month != now.month:
        return
    # Once per calendar year (T&C)
    year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    existing = await db.execute(
        select(CustomerVoucher.id).where(
            CustomerVoucher.customer_id == customer_id,
            CustomerVoucher.source == "birthday_perk",
            CustomerVoucher.created_at >= year_start,
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        return
    # Valid until the end of the birthday month
    if now.month == 12:
        month_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    code = "BDAY-UPGRADE" if tier_key == "origin" else "BDAY-GIFT"
    await grant_voucher_to_customer(db, customer_id, code, source="birthday_perk", expires_at=month_end)


async def _evaluate_tier_renewal(db: AsyncSession, account: LoyaltyAccount):
    """12-month rolling tier review per the program structure.

    When the current spend window has run for the tier's validity period:
    - annual spend meets the renewal requirement → renew (new window starts)
    - otherwise → downgrade one tier (tier.downgrade_to_tier_key)
    Bloom (validity_months NULL) has no expiry and is never reviewed.
    """
    if not account.current_tier_id:
        return
    tier = await db.get(LoyaltyTier, account.current_tier_id)
    if not tier or not tier.is_active or not tier.validity_months:
        return
    window_start = account.annual_spend_window_start
    if window_start is None:
        return  # no purchases yet — window starts on first capture
    now = datetime.now(timezone.utc)
    if now - window_start < timedelta(days=tier.validity_months * 30):
        return
    if (account.annual_spend or 0) >= (tier.renewal_annual_spend or 0) * 100:
        # Renewed — start a fresh window
        account.annual_spend = 0
        account.annual_spend_window_start = now
        return
    # Not maintained — downgrade one tier and start a fresh window
    if tier.downgrade_to_tier_key:
        result = await db.execute(
            select(LoyaltyTier).where(
                LoyaltyTier.tier_key == tier.downgrade_to_tier_key,
                LoyaltyTier.is_active.is_(True),
            )
        )
        target = result.scalar_one_or_none()
        if target:
            account.current_tier_id = target.id
            account.last_tier_change_at = now
    account.annual_spend = 0
    account.annual_spend_window_start = now


async def get_default_tier_id(db: AsyncSession) -> int | None:
    """Get the lowest active tier ID (by sort_order, then id)."""
    result = await db.execute(
        select(LoyaltyTier.id)
        .where(LoyaltyTier.is_active.is_(True))
        .order_by(LoyaltyTier.sort_order, LoyaltyTier.id)
        .limit(1)
    )
    row = result.fetchone()
    return row[0] if row else None


async def credit_referral_points(
    db: AsyncSession,
    referrer_customer_id: int,
    invitee_customer_id: int | None = None,
) -> int:
    """Credit loyalty points to a referrer for a successful referral.
    Reads points amount from platform_config (default 50).
    Returns amount credited, or 0 if no action taken."""
    from app.models.platform import PlatformConfig

    # Get configured reward amount
    result = await db.execute(
        select(PlatformConfig).where(
            PlatformConfig.config_key == "loyalty.referral_reward_points"
        )
    )
    config = result.scalar_one_or_none()
    points = int(config.config_value) if config and config.config_value else 50

    # Get or create referrer's loyalty account (with row lock)
    result = await db.execute(
        select(LoyaltyAccount).where(
            LoyaltyAccount.customer_id == referrer_customer_id
        ).with_for_update()
    )
    account = result.scalar_one_or_none()
    if not account:
        default_tier = await get_default_tier_id(db)
        account = LoyaltyAccount(
            customer_id=referrer_customer_id,
            current_tier_id=default_tier,
            points_balance=0,
            lifetime_points_earned=0,
        )
        db.add(account)
        await db.flush()

    # Credit points
    if invitee_customer_id:
        result = await db.execute(
            select(ReferralEvent).where(
                ReferralEvent.referrer_customer_id == referrer_customer_id,
                ReferralEvent.invitee_customer_id == invitee_customer_id,
                ReferralEvent.status == "converted",
            )
        )
        # Legacy duplicate (referrer, invitee) rows may exist — take the
        # first instead of crashing on MultipleResultsFound.
        referral = result.scalars().first()
        if not referral:
            await db.flush()
            return 0
        referral.status = "rewarded"
        referral.reward_issued_at = datetime.now(timezone.utc)

    account.points_balance += points
    account.lifetime_points_earned += points

    # Track referral stats on the referrer (surfaced via GET /me)
    referrer = await db.get(Customer, referrer_customer_id)
    if referrer is not None:
        referrer.referral_count = (referrer.referral_count or 0) + 1
        referrer.referral_earnings_total = (referrer.referral_earnings_total or 0) + points

    # Auto-upgrade tier (only goes up, never down)
    await _recalculate_tier(db, account)

    # Log to ledger
    ledger = LoyaltyPointsLedger(
        loyalty_account_id=account.id,
        customer_id=referrer_customer_id,
        event_type="referral_bonus",
        points_delta=points,
        running_balance=account.points_balance,
        description=f"Referral bonus — invitee #{invitee_customer_id or '?'} joined",
    )
    db.add(ledger)

    await db.flush()
    # Transactional notification (savepoint-isolated, never blocks).
    from app.services.transactional_notifications import notify_event
    try:
        await notify_event(
            db, "referral_credited", referrer_customer_id,
            context={"points": points},
            entity_type="referral_event", entity_id=invitee_customer_id or 0,
        )
    except Exception:
        logger.exception("referral_credited notification failed for customer %s", referrer_customer_id)
    return points


async def expire_stale_wallet_items(db: AsyncSession, customer_id: int) -> int:
    """Lazily mark a customer's expired vouchers/rewards as 'expired'.

    Rows are granted with status 'active' and a future expires_at, but nothing
    swept them once that date passed — so expired items kept appearing in every
    wallet view (PWA wallet, kiosk picker, POS drawer) until the order-time
    guard rejected them. Only 'active' rows are touched: 'reserved' items
    belong to in-flight orders and are owned by the order lifecycle.
    Caller must commit when the returned count is non-zero.
    """
    from app.models.reward import CustomerReward
    from app.models.voucher import CustomerVoucher

    now = datetime.now(timezone.utc)
    expired = 0
    for model in (CustomerVoucher, CustomerReward):
        result = await db.execute(
            select(model).where(
                model.customer_id == customer_id,
                model.status == "active",
                model.expires_at.is_not(None),
                model.expires_at < now,
            )
        )
        for row in result.scalars().all():
            row.status = "expired"
            expired += 1
    if expired:
        await db.flush()
    return expired
