"""Customer daily check-in endpoint for loyalty streak tracking."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.routes.deps import ActiveCustomer, DBDependency
from app.models.checkin import CustomerDailyCheckin
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger
from app.models.platform import PlatformConfig
from app.schemas.base import APIResponse

router = APIRouter(tags=["customer — check-in"])


async def _get_checkin_config(db):
    """Get check-in reward config from platform_config."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("checkin."))
    )
    configs = {c.config_key: int(c.config_value) for c in result.scalars().all() if str(c.config_value).isdigit()}
    return {
        "daily_base_points": configs.get("checkin.daily_base_points", 10),
        "streak_increment": configs.get("checkin.streak_increment", 2),
        "streak_7day_bonus": configs.get("checkin.streak_7day_bonus", 20),
        "max_streak_days": configs.get("checkin.max_streak_days", 7),
    }


@router.post("/checkin", response_model=APIResponse[dict])
async def daily_checkin(db: DBDependency, customer: ActiveCustomer):
    """Customer daily check-in — awards loyalty points based on streak."""
    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc)

    # Check if already checked in today (compare date portion only via func.date)
    existing = await db.execute(
        select(CustomerDailyCheckin).where(
            CustomerDailyCheckin.customer_id == customer.id,
            func.date(CustomerDailyCheckin.checkin_date) == today,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already checked in today")

    # Get customer's loyalty account (lock row to prevent race conditions)
    la_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer.id).with_for_update()
    )
    la = la_result.scalar_one_or_none()
    if not la:
        la = LoyaltyAccount(customer_id=customer.id, points_balance=0, lifetime_points_earned=0, lifetime_points_redeemed=0)
        db.add(la)
        await db.flush()

    # Determine streak
    yesterday_result = await db.execute(
        select(CustomerDailyCheckin).where(
            CustomerDailyCheckin.customer_id == customer.id,
        ).order_by(CustomerDailyCheckin.checkin_date.desc()).limit(1)
    )
    last = yesterday_result.scalar_one_or_none()

    cfg = await _get_checkin_config(db)

    if last and last.checkin_date:
        last_date = last.checkin_date.date() if hasattr(last.checkin_date, 'date') else last.checkin_date
        days_since = (today - last_date).days
        has_yesterday = last.checkin_date and days_since == 1
        streak = last.streak_day if has_yesterday else 0
    else:
        streak = 0

    new_streak = streak + 1
    max_streak = cfg["max_streak_days"]
    if new_streak > max_streak:
        new_streak = 1  # reset after max

    # Calculate points
    points = cfg["daily_base_points"]
    points += (new_streak - 1) * cfg["streak_increment"]
    if new_streak == 7 or (new_streak % 7 == 0 and new_streak <= max_streak):
        points += cfg["streak_7day_bonus"]

    # Create check-in record
    checkin = CustomerDailyCheckin(
        customer_id=customer.id,
        checkin_date=now,
        streak_day=new_streak,
        points_earned=points,
    )
    db.add(checkin)

    # Award loyalty points
    ledger = LoyaltyPointsLedger(
        loyalty_account_id=la.id,
        customer_id=customer.id,
        event_type="promo_bonus",
        points_delta=points,
        running_balance=la.points_balance + points,
        description=f"Day {new_streak} check-in streak",
    )
    db.add(ledger)
    la.points_balance += points
    la.lifetime_points_earned = (la.lifetime_points_earned or 0) + points

    await db.commit()
    await db.refresh(checkin)

    return APIResponse(data={
        "checked_in": True,
        "streak_day": new_streak,
        "points_earned": points,
        "total_points": la.points_balance,
        "next_bonus_day": 7 if new_streak < 7 else (7 - (new_streak % 7)) or 7,
    })


@router.get("/checkin", response_model=APIResponse[dict])
async def get_checkin_status(db: DBDependency, customer: ActiveCustomer):
    """Get current check-in status, streak, and rewards config."""
    today = datetime.now(timezone.utc).date()

    existing = await db.execute(
        select(CustomerDailyCheckin).where(
            CustomerDailyCheckin.customer_id == customer.id,
            func.date(CustomerDailyCheckin.checkin_date) == today,
        )
    )
    checked_in = existing.scalar_one_or_none()

    yesterday = await db.execute(
        select(CustomerDailyCheckin).where(
            CustomerDailyCheckin.customer_id == customer.id,
        ).order_by(CustomerDailyCheckin.checkin_date.desc()).limit(1)
    )
    last = yesterday.scalar_one_or_none()

    cfg = await _get_checkin_config(db)

    return APIResponse(data={
        "checked_in_today": checked_in is not None,
        "current_streak": checked_in.streak_day if checked_in else (last.streak_day if last else 0),
        "points_today": checked_in.points_earned if checked_in else 0,
        "config": cfg,
    })
