import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.order import Payment
from app.models.wallet import PaymentMethod
from app.schemas.payment import PaymentIntentCreate, PaymentConfirm, PaymentMethodOut, PaymentMethodCreate

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/create-intent")
async def create_payment_intent(req: PaymentIntentCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.order import Order
    result = await db.execute(select(Order).where(Order.id == req.order_id, Order.user_id == user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    payment = Payment(
        order_id=order.id, method=req.method,
        amount=order.total, status="pending",
        transaction_id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
    )
    db.add(payment)
    await db.flush()
    return {"payment_id": payment.id, "transaction_id": payment.transaction_id, "amount": float(payment.amount), "status": "pending"}


@router.post("/confirm")
async def confirm_payment(req: PaymentConfirm, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == req.payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "paid"
    if req.transaction_id:
        payment.transaction_id = req.transaction_id

    from app.models.order import Order
    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if order:
        order.payment_status = "paid"
    await db.flush()
    return {"message": "Payment confirmed", "status": "paid"}


@router.get("/methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PaymentMethod).where(PaymentMethod.user_id == user.id))
    return result.scalars().all()


@router.post("/methods", response_model=PaymentMethodOut, status_code=201)
async def add_payment_method(req: PaymentMethodCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    pm = PaymentMethod(user_id=user.id, type=req.type, provider=req.provider, last4=req.last4, is_default=1 if req.is_default else 0)
    db.add(pm)
    await db.flush()
    return pm
