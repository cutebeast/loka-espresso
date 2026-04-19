import secrets
from datetime import timezone, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.social import Referral
from app.models.notification import Notification

router = APIRouter(prefix="/referral", tags=["Referral"])

# Maximum account age (days) to apply a referral code
REFERRAL_MAX_AGE_DAYS = 7


@router.get("/code")
async def get_referral_code(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Referral).where(Referral.referrer_id == user.id))
    ref = result.scalar_one_or_none()
    if not ref:
        code = f"REF-{user.id}-{secrets.token_hex(3).upper()}"
        ref = Referral(referrer_id=user.id, code=code)
        db.add(ref)
        await db.flush()
    return {"code": ref.code, "referrals": 0}


@router.post("/apply")
async def apply_referral(code: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Check if user already applied a referral
    existing = await db.execute(
        select(Referral).where(Referral.invitee_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already applied a referral code")

    # Enforce account age limit
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
    notif = Notification(
        user_id=ref.referrer_id, title="Referral Applied",
        body=f"Your referral code was used!", type="referral",
    )
    db.add(notif)
    await db.flush()
    return {"message": "Referral applied successfully"}
