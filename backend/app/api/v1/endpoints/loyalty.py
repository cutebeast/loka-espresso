from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction, LoyaltyTier
from app.schemas.loyalty import LoyaltyBalanceOut, LoyaltyTransactionOut, LoyaltyTierOut

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


@router.get("/balance", response_model=LoyaltyBalanceOut)
async def get_balance(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
    la = result.scalar_one_or_none()
    if not la:
        la = LoyaltyAccount(user_id=user.id)
        db.add(la)
        await db.flush()
    return la


@router.get("/history", response_model=list[LoyaltyTransactionOut])
async def get_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoyaltyTransaction).where(LoyaltyTransaction.user_id == user.id).order_by(LoyaltyTransaction.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.get("/tiers", response_model=list[LoyaltyTierOut])
async def get_tiers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LoyaltyTier).order_by(LoyaltyTier.min_points))
    return result.scalars().all()
