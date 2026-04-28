import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.commerce import settle_order_payment
from app.core.database import get_db
from app.core.security import get_current_user, is_global_admin, is_hq, can_access_store
from app.core.audit import log_action
from app.core.utils import to_float
from app.models.customer import Customer
from app.models.order import Order, OrderStatusHistory, OrderStatus, Payment
from app.models.notification import Notification
from app.schemas.order import OrderStatusUpdate, UpdatePaymentStatusRequest

from .order_crud import VALID_TRANSITIONS, VALID_TRANSITIONS_BY_TYPE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: int, req: OrderStatusUpdate,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if is_global_admin(user) or is_hq(user):
        pass
    else:
        order_check = await db.execute(select(Order).where(Order.id == order_id))
        order_obj = order_check.scalar_one_or_none()
        if not order_obj:
            raise HTTPException(status_code=404, detail="Order not found")
        if not await can_access_store(user, order_obj.store_id, db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this store")

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)
    new_status = req.status.value if hasattr(req.status, 'value') else str(req.status)
    updated_fields = []

    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    type_transitions = VALID_TRANSITIONS_BY_TYPE.get(order_type, VALID_TRANSITIONS)
    valid_next = type_transitions.get(old_status, [])
    if new_status not in valid_next:
        valid_next_general = VALID_TRANSITIONS.get(old_status, [])
        if new_status not in valid_next_general:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid transition for {order_type}: {old_status} -> {new_status}. Valid: {valid_next}"
            )

    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)

    if new_status == "confirmed" and old_status not in ("pending", "paid"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm order in status: {old_status}. Must be pending or paid."
        )

    if new_status == "completed" and order.payment_status != "paid":
        order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
        is_cod_delivery = order_type == "delivery" and order.payment_method == "cod"
        if not is_cod_delivery:
            raise HTTPException(
                status_code=400,
                detail=f"Order cannot be completed until payment is made. Current payment_status: {order.payment_status}"
            )
        payment_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = payment_result.scalar_one_or_none()
        if not payment:
            payment = Payment(
                order_id=order.id,
                method="cod",
                provider="delivery_partner",
                amount=to_float(order.total),
                status="pending",
            )
            db.add(payment)
            await db.flush()
        await settle_order_payment(db, order, payment, transaction_id=f"cod-{order.order_number}", provider_reference="cod-collected-by-driver")
        updated_fields.append("payment_status: auto-settled (COD)")

    order.status = req.status
    history = OrderStatusHistory(order_id=order.id, status=req.status, note=req.note)
    if req.completed_at:
        history.created_at = req.completed_at
    db.add(history)
    notif = Notification(
        user_id=order.user_id, title=f"Order {new_status}",
        body=f"Your order {order.order_number} is now {new_status}",
        type="order",
    )
    db.add(notif)

    if new_status in ("completed", "cancelled") and order.table_id:
        from app.models.store import StoreTable as STModel
        from app.models.marketing import TableOccupancySnapshot
        tbl_result = await db.execute(select(STModel).where(STModel.id == order.table_id))
        tbl = tbl_result.scalar_one_or_none()
        if tbl and tbl.is_occupied:
            tbl.is_occupied = False
            snap_result = await db.execute(
                select(TableOccupancySnapshot).where(TableOccupancySnapshot.table_id == order.table_id)
            )
            snapshot = snap_result.scalar_one_or_none()
            if snapshot:
                snapshot.is_occupied = False
                snapshot.current_order_id = None
                snapshot.updated_at = datetime.now(timezone.utc)

    await log_action(db, action="ORDER_STATUS_CHANGE", user_id=user.id, store_id=order.store_id, entity_type="order", entity_id=order.id, details={"order_number": order.order_number, "from": old_status, "to": new_status})
    await db.flush()
    return {
        "message": f"Order status updated to {new_status}",
        "discounts_applied": {
            "voucher_discount": to_float(order.voucher_discount),
            "reward_discount": to_float(order.reward_discount),
        },
        "new_total": to_float(order.total),
        "loyalty_points_earned": order.loyalty_points_earned,
    }


@router.patch("/{order_id}/payment-status")
async def update_order_payment_status(
    order_id: int,
    req: UpdatePaymentStatusRequest,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update order payment_status directly.
    This is used for Flow B (dine-in) where payment happens at the end of the meal.
    Can be triggered by:
    - Admin/HQ staff
    - Store staff with access to the order's store
    - External POS system (via webhook)
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    has_access = is_global_admin(user) or is_hq(user) or await can_access_store(user, order.store_id, db)
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to update payment for this order")

    payment_status = req.payment_status
    if not payment_status:
        raise HTTPException(status_code=400, detail="payment_status is required")

    old_payment_status = order.payment_status
    points_earned = 0
    if payment_status == "paid" and old_payment_status != "paid":
        payment_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = payment_result.scalar_one_or_none()
        if not payment:
            payment = Payment(
                order_id=order.id,
                method=order.payment_method,
                provider="internal",
                amount=to_float(order.total),
                status="pending",
                transaction_id=f"MANUAL-{uuid.uuid4().hex[:10].upper()}",
            )
            db.add(payment)
            await db.flush()
        points_earned = await settle_order_payment(db, order, payment)
        from app.api.v1.endpoints.pwa.referral import award_referrer_on_order
        await award_referrer_on_order(order.user_id, db)
    else:
        order.payment_status = payment_status
        payment_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = payment_result.scalar_one_or_none()
        if payment:
            payment.status = payment_status

    await db.flush()
    return {
        "message": f"Order payment status updated to {payment_status}",
        "order_id": order.id,
        "payment_status": payment_status,
        "loyalty_points_earned": points_earned,
    }
