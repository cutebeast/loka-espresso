"""Commerce service — referral rewards, loyalty crediting."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import ReferralEvent
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier


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


async def _birthday_points_multiplier(db: AsyncSession, customer_id: int) -> Decimal:
    """Double points during the customer's birthday month (all tiers, per program)."""
    from app.models.customer import Customer
    result = await db.execute(
        select(Customer.date_of_birth).where(Customer.id == customer_id)
    )
    dob = result.scalar_one_or_none()
    if dob and dob.month == datetime.now(timezone.utc).month:
        return Decimal(2)
    return Decimal(1)


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
        referral = result.scalar_one_or_none()
        if not referral:
            await db.flush()
            return 0
        referral.status = "rewarded"
        referral.reward_issued_at = datetime.now(timezone.utc)

    account.points_balance += points
    account.lifetime_points_earned += points

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
    return points
