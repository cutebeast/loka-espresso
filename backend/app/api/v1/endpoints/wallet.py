from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction, WalletTxType
from app.schemas.wallet import WalletOut, WalletTopup, WalletTransactionOut

router = APIRouter(prefix="/wallet", tags=["Wallet"])


async def _get_or_create_wallet(user_id: int, db: AsyncSession) -> Wallet:
    result = await db.execute(select(Wallet).where(Wallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(user_id=user_id)
        db.add(wallet)
        await db.flush()
    return wallet


@router.get("", response_model=WalletOut)
async def get_wallet(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wallet = await _get_or_create_wallet(user.id, db)
    return wallet


@router.post("/topup")
async def topup_wallet(req: WalletTopup, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wallet = await _get_or_create_wallet(user.id, db)
    wallet.balance += req.amount
    tx = WalletTransaction(
        wallet_id=wallet.id, amount=req.amount,
        type=WalletTxType.topup, description=req.description or "Top up",
    )
    db.add(tx)
    await db.flush()
    return {"message": "Top up successful", "new_balance": float(wallet.balance)}


@router.get("/transactions", response_model=list[WalletTransactionOut])
async def wallet_transactions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wallet = await _get_or_create_wallet(user.id, db)
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()
