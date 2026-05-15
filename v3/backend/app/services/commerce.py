"""Commerce service — referral rewards, loyalty crediting."""

from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import ReferralEvent
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier


async def _recalculate_tier(db: AsyncSession, account: LoyaltyAccount):
    """Auto-upgrade tier based on lifetime_points_earned. Never downgrades."""
    result = await db.execute(
        select(LoyaltyTier).where(LoyaltyTier.is_active.is_(True)).order_by(LoyaltyTier.sort_order.desc())
    )
    tiers = result.scalars().all()
    if not tiers:
        return
    best = tiers[-1]  # lowest tier as fallback
    for t in tiers:
        if account.lifetime_points_earned >= t.min_lifetime_points:
            best = t
            break
    if account.current_tier_id != best.id:
        account.current_tier_id = best.id
        account.last_tier_change_at = datetime.now(timezone.utc)


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

    # Get or create referrer's loyalty account
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == referrer_customer_id)
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

    # Mark referral as rewarded
    if invitee_customer_id:
        result = await db.execute(
            select(ReferralEvent).where(
                ReferralEvent.referrer_customer_id == referrer_customer_id,
                ReferralEvent.invitee_customer_id == invitee_customer_id,
                ReferralEvent.status == "converted",
            )
        )
        referral = result.scalar_one_or_none()
        if referral:
            referral.status = "rewarded"
            referral.reward_issued_at = datetime.now(timezone.utc)

    await db.flush()
    return points
