import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.commerce import settle_order_payment
from app.core.database import get_db
from app.core.security import get_current_user, can_access_store
from app.core.webhooks import verify_webhook_request
from app.core.utils import to_float
from app.core.config import get_settings
from app.models.customer import Customer
from app.models.order import Order, OrderStatusHistory, OrderStatus, OrderType, Payment
from app.models.notification import Notification

from .order_crud import _order_out
from app.schemas.order import StaffNotesRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("/{order_id}/delivery-webhook")
async def delivery_provider_webhook(
    order_id: int,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for 3rd party Delivery Provider to notify of delivery status.

    NOTE: This endpoint is ready for integration but no live 3PL (Grab/Lalamove/etc.)
    is currently connected. In manual mode, staff book drivers externally and mark
    orders as dispatched via the admin UI. When a real 3PL API is connected, this
    endpoint will receive automatic status updates.

    Expected events:
    - picked_up → out_for_delivery
    - out_for_delivery → customer notification
    - delivered → completed (auto-settles COD payments)
    - failed / cancelled → ready (for re-dispatch)
    """
    _settings = get_settings()
    await verify_webhook_request(
        request,
        api_key=_settings.WEBHOOK_API_KEY,
        signing_secret=_settings.WEBHOOK_SIGNING_SECRET,
    )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    if order_type != "delivery":
        raise HTTPException(status_code=400, detail="This webhook is only for delivery orders")

    delivery_status = payload.get("status")
    delivery_id = payload.get("delivery_id")
    driver_info = payload.get("driver", {})
    tracking_url = payload.get("tracking_url")
    eta_minutes = payload.get("eta_minutes")
    quote_id = payload.get("quote_id")

    if not delivery_status:
        raise HTTPException(status_code=400, detail="status is required")

    status_mapping = {
        "awaiting_dispatch": "ready",
        "driver_assigned": "ready",
        "picked_up": "out_for_delivery",
        "out_for_delivery": "out_for_delivery",
        "in_transit": "out_for_delivery",
        "delivered": "completed",
        "failed": "ready",
        "cancelled": "ready",
    }

    new_status = status_mapping.get(delivery_status)
    if not new_status:
        return {
            "message": f"Status '{delivery_status}' received but no action taken",
            "order_id": order_id,
        }

    order.delivery_status = delivery_status
    order.delivery_external_id = delivery_id or order.delivery_external_id
    order.delivery_quote_id = quote_id or order.delivery_quote_id
    order.delivery_tracking_url = tracking_url or order.delivery_tracking_url
    if eta_minutes is not None:
        try:
            order.delivery_eta_minutes = int(eta_minutes)
        except (TypeError, ValueError):
            pass
    if driver_info:
        order.delivery_courier_name = driver_info.get("name") or order.delivery_courier_name
        order.delivery_courier_phone = driver_info.get("phone") or order.delivery_courier_phone
    order.delivery_last_event_at = datetime.now(timezone.utc)

    old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)

    if new_status != old_status:
        order.status = OrderStatus(new_status)

        history = OrderStatusHistory(
            order_id=order.id,
            status=OrderStatus(new_status),
            note=f"Delivery webhook: {delivery_status} (Driver: {driver_info.get('name', 'Unknown')})",
        )
        db.add(history)

        if delivery_status == "delivered":
            payment_method = order.payment_method or ""
            if payment_method == "cod" and order.payment_status != "paid":
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

            notif = Notification(
                user_id=order.user_id,
                customer_id=order.user_id,
                title="Order Delivered",
                body=f"Your order {order.order_number} has been delivered!",
                type="order",
            )
            db.add(notif)
        elif delivery_status == "out_for_delivery":
            notif = Notification(
                user_id=order.user_id,
                customer_id=order.user_id,
                title="Out for Delivery",
                body=f"Your order {order.order_number} is on the way!",
                type="order",
            )
            db.add(notif)
        elif delivery_status == "driver_assigned":
            notif = Notification(
                user_id=order.user_id,
                customer_id=order.user_id,
                title="Driver Assigned",
                body=f"A courier has been assigned to order {order.order_number}.",
                type="order",
            )
            db.add(notif)

    await db.flush()

    return {
        "message": f"Delivery status updated to {delivery_status}",
        "order_id": order_id,
        "order_status": new_status,
        "delivery_id": delivery_id,
    }


@router.post("/{order_id}/pos-webhook")
async def external_pos_webhook(
    order_id: int,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for External POS system to notify of order status and payment.

    NOTE: This endpoint is ready for integration but no live POS is currently
    connected. In manual mode, staff re-key orders into the POS terminal and
    mark them synced via the admin UI. When a real POS API is connected, this
    endpoint will receive automatic status updates.

    Expected events:
    - status updates: confirmed, preparing, ready, completed, cancelled
    - payment_status: paid (auto-creates Payment record and settles loyalty)
    """
    _settings = get_settings()
    await verify_webhook_request(
        request,
        api_key=_settings.WEBHOOK_API_KEY,
        signing_secret=_settings.WEBHOOK_SIGNING_SECRET,
    )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pos_status = payload.get("status")
    payment_status = payload.get("payment_status")
    pos_order_id = payload.get("pos_order_id")

    updated_fields = []

    if pos_status:
        valid_statuses = ["confirmed", "preparing", "ready", "completed", "cancelled"]
        if pos_status in valid_statuses:
            old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)
            if pos_status != old_status:
                order.status = OrderStatus(pos_status)
                updated_fields.append(f"status: {pos_status}")

                history = OrderStatusHistory(
                    order_id=order.id,
                    status=OrderStatus(pos_status),
                    note=f"POS webhook update (POS Order: {pos_order_id})",
                )
                db.add(history)

    if payment_status == "paid" and order.payment_status != "paid":
        updated_fields.append("payment_status: paid")
        payment_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = payment_result.scalar_one_or_none()
        if not payment:
            payment = Payment(
                order_id=order.id,
                method=order.payment_method or "cash",
                provider="pos",
                amount=to_float(order.total),
                status="pending",
                transaction_id=pos_order_id,
                provider_reference=pos_order_id,
            )
            db.add(payment)
            await db.flush()
        points = await settle_order_payment(
            db,
            order,
            payment,
            transaction_id=pos_order_id,
            provider_reference=pos_order_id,
        )
        if points > 0:
            updated_fields.append(f"loyalty_points: {points}")

    await db.flush()

    return {
        "message": "POS webhook processed",
        "order_id": order_id,
        "updates": updated_fields,
    }


@router.post("/{order_id}/pos-synced")
async def mark_order_pos_synced(
    order_id: int,
    req: StaffNotesRequest | None = None,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark an order as manually synced to the POS system.
    Used in manual mode when staff have re-keyed the order into the POS terminal.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not await can_access_store(user, order.store_id, db):
        raise HTTPException(status_code=403, detail="Cannot modify this order")

    if order.pos_synced_at is not None:
        raise HTTPException(status_code=400, detail="Order already marked as POS synced")

    order.pos_synced_at = datetime.now(timezone.utc)
    order.pos_synced_by = user.id

    note_text = req.staff_notes if req else None
    if note_text:
        order.staff_notes = note_text

    history = OrderStatusHistory(
        order_id=order.id,
        status=order.status,
        note="Order manually synced to POS" + (f" — {note_text}" if note_text else "")
    )
    db.add(history)
    await db.flush()

    return _order_out(order)


@router.post("/{order_id}/delivery-dispatched")
async def mark_order_delivery_dispatched(
    order_id: int,
    req: StaffNotesRequest | None = None,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a delivery order as manually dispatched.
    Used in manual mode when staff have booked a driver via external app.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not await can_access_store(user, order.store_id, db):
        raise HTTPException(status_code=403, detail="Cannot modify this order")

    if order.order_type != OrderType.delivery:
        raise HTTPException(status_code=400, detail="Only delivery orders can be marked as dispatched")

    if order.delivery_dispatched_at is not None:
        raise HTTPException(status_code=400, detail="Order already marked as dispatched")

    order.delivery_dispatched_at = datetime.now(timezone.utc)
    order.delivery_dispatched_by = user.id

    note_text = req.staff_notes if req else None
    if note_text:
        order.staff_notes = note_text

    history = OrderStatusHistory(
        order_id=order.id,
        status=order.status,
        note="Delivery manually dispatched" + (f" — {note_text}" if note_text else "")
    )
    db.add(history)
    await db.flush()

    return _order_out(order)
