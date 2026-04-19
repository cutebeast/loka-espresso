from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import to_float
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
    import traceback, sys
    try:
        wallet = await _get_or_create_wallet(user.id, db)
        # Strip timezone info to get naive datetime — required by asyncpg for TIMESTAMP columns
        created_at_val = req.created_at.replace(tzinfo=None) if req.created_at else None

        # Use RETURNING clause to get the exact new balance atomically
        result = await db.execute(
            text("""
                UPDATE wallets
                SET balance = balance + :amt
                WHERE id = :wid
                RETURNING balance
            """),
            {"amt": req.amount, "wid": wallet.id}
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Wallet not found")
        new_balance = row[0]

        # Insert transaction record
        await db.execute(
            text("""
                INSERT INTO wallet_transactions (wallet_id, user_id, amount, type, description, balance_after, created_at)
                VALUES (:wid, :uid, :amt, 'topup', :desc, :bal_after, :cat)
            """),
            {"wid": wallet.id, "uid": user.id, "amt": req.amount,
             "desc": req.description or "Top up", "bal_after": new_balance, "cat": created_at_val}
        )
        await db.flush()
        return {"message": "Top up successful", "new_balance": to_float(new_balance)}
    except HTTPException:
        raise
    except Exception as e:
        sys.stderr.write(f"WALLET TOPUP ERROR user={user.id}: {e}\n")
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        raise


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


# Payment Gateway Webhook - called by 3rd party PG when payment completes
class PGWebhookPayload(BaseModel):
    charge_id: str
    status: str
    amount: float
    currency: str
    user_id: int
    timestamp: str
    note: Optional[str] = None
    failure_reason: Optional[str] = None


@router.post("/webhook/pg-payment")
async def pg_payment_webhook(payload: PGWebhookPayload, db: AsyncSession = Depends(get_db)):
    """
    Webhook endpoint for Payment Gateway to notify of payment status.
    This is called by the 3rd party PG when a payment is completed or failed.
    """
    if payload.status == "completed":
        # Payment successful - add to wallet
        wallet = await _get_or_create_wallet(payload.user_id, db)
        
        # Update wallet balance
        result = await db.execute(
            text("""
                UPDATE wallets
                SET balance = balance + :amt
                WHERE id = :wid
                RETURNING balance
            """),
            {"amt": payload.amount, "wid": wallet.id}
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Wallet not found")
        new_balance = row[0]
        
        # Record transaction
        await db.execute(
            text("""
                INSERT INTO wallet_transactions (wallet_id, user_id, amount, type, description, balance_after, created_at)
                VALUES (:wid, :uid, :amt, 'topup', :desc, :bal_after, NOW())
            """),
            {
                "wid": wallet.id,
                "uid": payload.user_id,
                "amt": payload.amount,
                "desc": f"Top up via PG (Charge: {payload.charge_id})",
                "bal_after": new_balance
            }
        )
        await db.flush()
        
        return {
            "message": "Payment processed and wallet updated",
            "charge_id": payload.charge_id,
            "new_balance": to_float(new_balance)
        }
    
    elif payload.status == "failed":
        # Payment failed - log but don't add to wallet
        return {
            "message": "Payment failed",
            "charge_id": payload.charge_id,
            "reason": payload.failure_reason or "Unknown"
        }
    
    else:
        # Other status (processing, pending) - just acknowledge
        return {
            "message": f"Payment status received: {payload.status}",
            "charge_id": payload.charge_id
        }
