import secrets
from datetime import timezone, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.sql import text

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.commerce import credit_wallet
from app.core.utils import to_float
from app.models.customer import Customer
from app.models.social import Referral
from app.models.notification import Notification
from app.models.splash import AppConfig

router = APIRouter(prefix="/referral", tags=["Referral"])

REFERRAL_MAX_AGE_DAYS = 7
DEFAULT_REWARD_AMOUNT = 5.00
DEFAULT_MIN_ORDERS = 1


@router.get("/code")
async def get_referral_code(user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Referral).where(Referral.referrer_id == user.id))
    ref = result.scalar_one_or_none()
    if not ref:
        code = f"REF-{user.id}-{secrets.token_hex(3).upper()}"
        ref = Referral(referrer_id=user.id, code=code)
        db.add(ref)
        await db.flush()

    count_result = await db.execute(
        select(func.count(Referral.id)).where(
            Referral.referrer_id == user.id,
            Referral.invitee_id.isnot(None)
        )
    )
    referral_count = count_result.scalar() or 0

    return {
        "code": ref.code,
        "referrals": referral_count,
        "earnings": to_float(user.referral_earnings),
        "reward_paid": ref.referrer_reward_paid,
    }


@router.post("/apply")
async def apply_referral(code: str, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Referral).where(Referral.invitee_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already applied a referral code")

    if user.created_at:
        account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=None)
        if account_age > timedelta(days=REFERRAL_MAX_AGE_DAYS):
            raise HTTPException(
                status_code=400,
                detail=f"Referral codes can only be applied within {REFERRAL_MAX_AGE_DAYS} days of account creation",
            )

    result = await db.execute(select(Referral).where(Referral.code == code))
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    if ref.referrer_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot use own referral code")

    ref.invitee_id = user.id
    user.referred_by = ref.referrer_id

    notif = Notification(
        user_id=ref.referrer_id, title="Referral Applied",
        body=f"Your referral code was used!", type="referral",
    )
    db.add(notif)
    await db.flush()
    return {"message": "Referral applied successfully"}


@router.get("/stats")
async def referral_stats(user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get detailed referral stats for the current user."""
    result = await db.execute(
        select(Referral).where(
            Referral.referrer_id == user.id,
            Referral.invitee_id.isnot(None)
        )
    )
    referrals = result.scalars().all()

    total_invited = len(referrals)
    paid_rewards = sum(1 for r in referrals if r.referrer_reward_paid)
    total_earnings = to_float(user.referral_earnings)

    invited_users = []
    for r in referrals:
        if r.invitee_id:
            u_result = await db.execute(select(User).where(User.id == r.invitee_id))
            invitee = u_result.scalar_one_or_none()
            invited_users.append({
                "name": invitee.name if invitee else "Unknown",
                "joined_at": r.created_at.isoformat() if r.created_at else None,
                "order_count": r.referred_user_order_count,
                "reward_paid": r.referrer_reward_paid,
            })

    return {
        "code": referrals[0].code if referrals else None,
        "total_invited": total_invited,
        "paid_rewards": paid_rewards,
        "total_earnings": total_earnings,
        "invited_users": invited_users,
    }


async def award_referrer_on_order(invitee_id: int, db: AsyncSession) -> None:
    """Award the referrer when a referred user completes their first order.
    
    Called after order payment is confirmed. Credits the referrer's wallet
    with the configured reward amount and updates referral counters.
    """
    ref_result = await db.execute(
        select(Referral).where(
            Referral.invitee_id == invitee_id,
            Referral.referrer_reward_paid == False,
        )
    )
    ref = ref_result.scalar_one_or_none()
    if not ref:
        return

    ref.referred_user_order_count += 1

    cfg_result = await db.execute(
        select(AppConfig).where(AppConfig.key == "referral_min_orders")
    )
    min_orders = int(cfg_result.scalar_one_or_none().value) if cfg_result.scalar_one_or_none() else DEFAULT_MIN_ORDERS

    if ref.referred_user_order_count < min_orders:
        return

    reward_result = await db.execute(
        select(AppConfig).where(AppConfig.key == "referral_reward_amount")
    )
    reward_amount = to_float(reward_result.scalar_one_or_none().value) if reward_result.scalar_one_or_none() else DEFAULT_REWARD_AMOUNT

    ref.referrer_reward_paid = True
    ref.reward_amount = reward_amount

    referrer_result = await db.execute(select(User).where(User.id == ref.referrer_id))
    referrer = referrer_result.scalar_one_or_none()
    if referrer:
        await credit_wallet(db, referrer.id, reward_amount, "referral_reward",
                           f"Referral reward for inviting user #{invitee_id}")
        referrer.referral_count = (referrer.referral_count or 0) + 1
        referrer.referral_earnings = to_float(referrer.referral_earnings) + reward_amount

        notif = Notification(
            user_id=referrer.id, title="Referral Reward!",
            body=f"You earned RM{reward_amount:.2f} for your referral!",
            type="referral",
        )
        db.add(notif)
