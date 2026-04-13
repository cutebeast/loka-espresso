import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.social import Referral
from app.models.notification import Notification

router = APIRouter(prefix="/referral", tags=["Referral"])


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
