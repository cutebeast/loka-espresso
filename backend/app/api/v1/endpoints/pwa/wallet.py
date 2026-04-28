from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.commerce import credit_wallet, debit_wallet, settle_order_payment
from app.core.database import get_db
from app.core.security import get_current_user, require_hq_access
from app.core.utils import to_float
from app.core.webhooks import verify_webhook_request
from app.core.config import get_settings
from app.core.audit import log_action
from app.models.customer import Customer
from app.models.wallet import Wallet, WalletTransaction, WalletTxType
from app.models.order import Order, Payment
from app.schemas.wallet import WalletOut, WalletTopup, WalletDeduct, WalletTransactionOut

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
async def get_wallet(user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wallet = await _get_or_create_wallet(user.id, db)
    return wallet


@router.post("/topup")
async def topup_wallet(req: WalletTopup, db: AsyncSession = Depends(get_db), user: Customer = Depends(require_hq_access())):
    try:
        target_user_id = req.user_id or user.id
        _, new_balance = await credit_wallet(
            db,
            target_user_id,
            req.amount,
            description=req.description or "Top up (admin)",
        )
        await log_action(
            db,
            action="wallet_topup",
            user_id=user.id,
            store_id=None,
            entity_type="wallet",
            entity_id=target_user_id,
            details={"amount": req.amount, "target_user_id": target_user_id, "description": req.description or "Top up (admin)"},
            ip_address=None,
            status="success",
        )
        await db.flush()
        return {"message": "Top up successful", "new_balance": to_float(new_balance)}
    except HTTPException:
        raise
    except Exception as e:
        await log_action(
            db,
            action="wallet_topup",
            user_id=user.id,
            store_id=None,
            entity_type="wallet",
            entity_id=req.user_id or user.id,
            details={"amount": req.amount, "error": str(e)},
            ip_address=None,
            status="failure",
        )
        raise


@router.post("/deduct")
async def deduct_wallet(req: WalletDeduct, db: AsyncSession = Depends(get_db), user: Customer = Depends(require_hq_access())):
    """Admin-only: Deduct amount from customer wallet."""
    target_user_id = req.user_id
    wallet = await _get_or_create_wallet(target_user_id, db)

    if float(wallet.balance) < req.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: {to_float(wallet.balance)}, Required: {req.amount}"
        )

    _, new_balance = await debit_wallet(
        db,
        target_user_id,
        req.amount,
        description=req.description,
    )

    await log_action(
        db,
        action="wallet_deduct",
        user_id=user.id,
        store_id=None,
        entity_type="wallet",
        entity_id=target_user_id,
        details={"amount": req.amount, "target_user_id": target_user_id, "description": req.description},
        ip_address=None,
        status="success",
    )
    await db.flush()

    return {"message": "Deduction successful", "new_balance": to_float(new_balance)}


@router.get("/transactions", response_model=list[WalletTransactionOut])
async def wallet_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wallet = await _get_or_create_wallet(user.id, db)
    count_q = select(func.count()).select_from(WalletTransaction).where(WalletTransaction.wallet_id == wallet.id)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
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
async def pg_payment_webhook(payload: PGWebhookPayload, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook endpoint for Payment Gateway to notify of payment status.
    This is called by the 3rd party PG when a payment is completed or failed.
    """
    settings = get_settings()
    await verify_webhook_request(
        request,
        api_key=settings.WEBHOOK_API_KEY,
        signing_secret=settings.WEBHOOK_SIGNING_SECRET,
    )

    if payload.status == "completed":
        existing_tx = await db.execute(
            select(WalletTransaction).where(
                WalletTransaction.user_id == payload.user_id,
                WalletTransaction.description == f"Top up via PG (Charge: {payload.charge_id})",
            )
        )
        tx = existing_tx.scalar_one_or_none()
        if tx:
            return {
                "message": "Payment already processed",
                "charge_id": payload.charge_id,
                "new_balance": to_float(tx.balance_after or 0),
            }

        _, new_balance = await credit_wallet(
            db,
            payload.user_id,
            payload.amount,
            description=f"Top up via PG (Charge: {payload.charge_id})",
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


# ============================================================================
# ORDER PAYMENT WEBHOOK
# ============================================================================

class OrderPaymentWebhookPayload(BaseModel):
    """Payload for order payment webhook from PG."""
    charge_id: str
    order_id: int
    status: str  # completed, failed, processing
    amount: float
    currency: str = "MYR"
    user_id: int
    timestamp: str
    note: Optional[str] = None
    failure_reason: Optional[str] = None


@router.post("/webhook/order-payment")
async def order_payment_webhook(payload: OrderPaymentWebhookPayload, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Webhook endpoint for Payment Gateway to notify of ORDER payment status.
    This is called by the 3rd party PG when an order payment is completed or failed.
    
    When payment is successful:
    1. Updates order payment_status to "paid"
    2. Awards loyalty points based on customer's tier
    3. Creates loyalty transaction record
    4. Sends notification to customer
    """
    settings = get_settings()
    await verify_webhook_request(
        request,
        api_key=settings.WEBHOOK_API_KEY,
        signing_secret=settings.WEBHOOK_SIGNING_SECRET,
    )

    order_result = await db.execute(select(Order).where(Order.id == payload.order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if payload.user_id != order.user_id:
        raise HTTPException(status_code=400, detail="Webhook user does not match order owner")
    if abs(to_float(order.total) - payload.amount) > 0.01:
        raise HTTPException(status_code=400, detail="Webhook amount does not match order total")

    payment_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
    payment = payment_result.scalar_one_or_none()
    if not payment:
        payment = Payment(
            order_id=order.id,
            method="card",
            provider="external",
            amount=payload.amount,
            status="pending",
            transaction_id=payload.charge_id,
            provider_reference=payload.charge_id,
        )
        db.add(payment)
        await db.flush()

    payment.provider = payment.provider or "external"
    payment.provider_reference = payload.charge_id

    if payload.status == "completed":
        points_earned = await settle_order_payment(
            db,
            order,
            payment,
            transaction_id=payload.charge_id,
            provider_reference=payload.charge_id,
        )
        await db.flush()

        return {
            "message": "Order payment processed and loyalty points awarded",
            "order_id": payload.order_id,
            "payment_status": "paid",
            "loyalty_points_earned": points_earned
        }
    
    elif payload.status == "failed":
        payment.status = "failed"
        payment.failure_reason = payload.failure_reason
        await db.flush()
        return {
            "message": "Order payment failed",
            "order_id": payload.order_id,
            "reason": payload.failure_reason or "Unknown"
        }
    
    else:
        payment.status = payload.status
        await db.flush()
        return {
            "message": f"Order payment status received: {payload.status}",
            "order_id": payload.order_id
        }
