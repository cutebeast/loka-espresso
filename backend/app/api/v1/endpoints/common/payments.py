import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import to_float
from app.models.user import User
from app.models.order import Order, Payment, OrderStatus
from app.models.wallet import Wallet, WalletTransaction, PaymentMethod, WalletTxType
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction, LoyaltyTier
from app.models.notification import Notification
from app.models.splash import AppConfig
from app.schemas.payment import PaymentIntentCreate, PaymentConfirm, PaymentMethodOut, PaymentMethodCreate

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/create-intent")
async def create_payment_intent(req: PaymentIntentCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == req.order_id, Order.user_id == user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    # Check if there's already a pending payment for this order
    existing_payment = await db.execute(
        select(Payment).where(Payment.order_id == order.id, Payment.status == "pending")
    )
    existing = existing_payment.scalar_one_or_none()
    if existing:
        return {"payment_id": existing.id, "transaction_id": existing.transaction_id, "amount": to_float(existing.amount), "status": existing.status}

    payment = Payment(
        order_id=order.id, method=req.method,
        amount=order.total, status="pending",
        transaction_id=f"PAY-{uuid.uuid4().hex[:12].upper()}",
    )
    db.add(payment)
    await db.flush()
    return {"payment_id": payment.id, "transaction_id": payment.transaction_id, "amount": to_float(payment.amount), "status": "pending"}


@router.post("/confirm")
async def confirm_payment(req: PaymentConfirm, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == req.payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "paid"
    if req.transaction_id:
        payment.transaction_id = req.transaction_id

    order_result = await db.execute(select(Order).where(Order.id == payment.order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.payment_status = "paid"
    order.status = OrderStatus.paid

    paid = to_float(order.subtotal) - to_float(order.discount) + to_float(order.delivery_fee)

    # ── WALLET DEDUCTION ──────────────────────────────────────────
    wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=400, detail="No wallet found")
    if to_float(wallet.balance) < paid:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Have {wallet.balance}, need {paid}")

    # Deduct from wallet
    new_balance = to_float(wallet.balance) - paid
    await db.execute(
        update(Wallet)
        .where(Wallet.user_id == user.id)
        .values(balance=new_balance)
    )

    # Record wallet transaction
    wallet_tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=user.id,
        amount=-paid,
        type=WalletTxType.payment,
        description=f"Payment for order {order.order_number}",
        balance_after=new_balance,
    )
    db.add(wallet_tx)

    cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "loyalty_points_per_rmse"))
    cfg_row = cfg_result.scalar_one_or_none()
    earn_rate = int(cfg_row.value) if cfg_row else 1

    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id))
    la = la_result.scalar_one_or_none()

    multiplier = 1.0
    if la:
        tier_result = await db.execute(
            select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
        )
        tier = tier_result.scalar_one_or_none()
        if tier:
            multiplier = float(tier.points_multiplier)

    points = int(paid * earn_rate * multiplier)

    if la:
        await db.execute(
            update(LoyaltyAccount)
            .where(LoyaltyAccount.user_id == order.user_id)
            .values(
                points_balance=LoyaltyAccount.points_balance + points,
                total_points_earned=LoyaltyAccount.total_points_earned + points,
            )
        )
    else:
        upsert = LoyaltyAccount(user_id=order.user_id, points_balance=points, tier="bronze", total_points_earned=points)
        db.add(upsert)
        la = upsert

    lt = LoyaltyTransaction(
        user_id=order.user_id, order_id=order.id, store_id=order.store_id,
        points=points, type="earn",
        description=f"Points earned: order {order.order_number}",
    )
    db.add(lt)
    order.loyalty_points_earned = points

    tier_result = await db.execute(
        select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
    )
    tier = tier_result.scalar_one_or_none()
    current_tier = la.tier
    # Calculate NEW lifetime after adding points (la.total_points_earned is stale since we updated via SQL)
    lifetime = la.total_points_earned + points

    tier_promotion_result = await db.execute(
        select(LoyaltyTier).where(LoyaltyTier.min_points <= lifetime).order_by(LoyaltyTier.min_points.desc()).limit(1)
    )
    new_tier_row = tier_promotion_result.scalar_one_or_none()
    if new_tier_row and new_tier_row.name != current_tier:
        await db.execute(
            update(LoyaltyAccount)
            .where(LoyaltyAccount.user_id == order.user_id)
            .values(tier=new_tier_row.name)
        )

    notif = Notification(
        user_id=order.user_id, title="Payment successful",
        body=f"Payment confirmed! +{points} points earned!",
        type="order",
    )
    db.add(notif)

    await db.flush()
    return {"message": "Payment confirmed", "status": "paid", "points_earned": points}


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