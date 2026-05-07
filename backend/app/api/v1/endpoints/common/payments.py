import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.commerce import debit_wallet, settle_order_payment
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import to_float
from app.models.customer import Customer
from app.models.order import Order, Payment, OrderStatus
from app.models.wallet import PaymentMethod
from app.schemas.payment import PaymentIntentCreate, PaymentConfirm, PaymentMethodOut, PaymentMethodCreate

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/create-intent")
async def create_payment_intent(req: PaymentIntentCreate, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == req.order_id, Order.user_id == user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    # Check if there's already a pending payment for this order
    existing_payment = await db.execute(
        select(Payment).where(Payment.order_id == order.id, Payment.status.in_(["pending", "processing", "requires_action"]))
    )
    existing = existing_payment.scalar_one_or_none()
    if existing:
        return {
            "payment_id": existing.id,
            "transaction_id": existing.transaction_id,
            "provider": existing.provider or req.provider or "internal",
            "method": existing.method,
            "amount": to_float(existing.amount),
            "status": existing.status,
        }

    payment = Payment(
        order_id=order.id, method=req.method,
        provider=req.provider or "internal",
        amount=order.total, status="pending",
        transaction_id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
        idempotency_key=req.idempotency_key,
    )
    db.add(payment)
    await db.flush()
    return {
        "payment_id": payment.id,
        "transaction_id": payment.transaction_id,
        "provider": payment.provider,
        "method": payment.method,
        "amount": to_float(payment.amount),
        "status": payment.status,
    }


@router.post("/confirm")
async def confirm_payment(req: PaymentConfirm, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == req.payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot confirm payment for another user's order")

    if payment.method != "wallet":
        raise HTTPException(status_code=400, detail="Only wallet payments can be confirmed here")
    if payment.status in {"failed", "refunded"}:
        raise HTTPException(status_code=400, detail=f"Payment is {payment.status}")
    if payment.status == "paid" and order.payment_status == "paid":
        return {
            "message": "Payment already confirmed",
            "payment_id": payment.id,
            "status": "paid",
            "points_earned": int(order.loyalty_points_earned or 0),
        }

    paid_amount = round(to_float(order.total), 2)
    _, new_balance = await debit_wallet(
        db,
        user.id,
        paid_amount,
        description=f"Payment for order {order.order_number}",
    )
    points = await settle_order_payment(
        db,
        order,
        payment,
        transaction_id=req.transaction_id,
        provider_reference=req.provider_reference,
    )

    await db.flush()
    return {
        "message": "Payment confirmed",
        "payment_id": payment.id,
        "status": "paid",
        "points_earned": points,
        "new_wallet_balance": new_balance,
    }


@router.get("/methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PaymentMethod).where(PaymentMethod.user_id == user.id))
    return result.scalars().all()


@router.post("/methods", response_model=PaymentMethodOut, status_code=201)
async def add_payment_method(req: PaymentMethodCreate, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.is_default:
        await db.execute(
            update(PaymentMethod)
            .where(PaymentMethod.user_id == user.id)
            .values(is_default=False)
        )
    pm = PaymentMethod(user_id=user.id, customer_id=user.id, type=req.type, provider=req.provider, last4=req.last4, is_default=1 if req.is_default else 0)
    db.add(pm)
    await db.flush()
    return pm


@router.delete("/methods/{method_id}")
async def delete_payment_method(
    method_id: int,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PaymentMethod).where(PaymentMethod.id == method_id, PaymentMethod.user_id == user.id))
    pm = result.scalar_one_or_none()
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")
    await db.delete(pm)
    await db.flush()
    return {"message": "Payment method deleted", "id": method_id}
