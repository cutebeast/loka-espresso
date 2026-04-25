import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, is_global_admin, can_access_store
from app.core.utils import to_float
from app.models.user import User
from app.models.order import Order, OrderStatusHistory, OrderStatus
from app.models.store import Store
from app.models.notification import Notification
from app.models.voucher import UserVoucher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["Orders"])


async def _send_order_to_pos(order: Order):
    """
    Send order to external POS system.

    NOTE: This is a placeholder for future POS API integration.
    Set POS_API_URL in your environment (e.g. https://your-pos-provider.com/api/orders)
    to enable automatic order sync. Until then, manual mode is used — staff re-key
    orders into the POS terminal and mark them synced via the admin UI.
    """
    from app.core.config import get_settings
    settings = get_settings()
    pos_url = settings.POS_API_URL

    if not pos_url:
        logger.info(f"POS_API_URL not configured — order {order.order_number} will be handled manually")
        return

    try:
        import httpx
        payload = {
            "order_id": order.id,
            "order_number": order.order_number,
            "store_id": order.store_id,
            "table_id": order.table_id,
            "order_type": order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type),
            "items": order.items,
            "total": float(order.total),
            "notes": order.notes,
        }
        async with httpx.AsyncClient() as client:
            await client.post(pos_url, json=payload, timeout=5.0)
        logger.info(f"Order {order.order_number} sent to POS at {pos_url}")
    except Exception as e:
        logger.warning(f"POS notification failed (best-effort): {e}")


@router.post("/{order_id}/confirm")
async def confirm_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm an order to send it to the kitchen/POS.
    Used for ALL order types when payment is collected later (pay_at_store, cod, cash).
    Prepaid orders should go pending → paid → confirmed instead.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.user_id != user.id and not await can_access_store(user, order.store_id, db):
        raise HTTPException(status_code=403, detail="Cannot confirm this order")

    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm order in status: {order.status}. Must be pending."
        )

    order.status = OrderStatus.confirmed
    history = OrderStatusHistory(
        order_id=order.id,
        status=OrderStatus.confirmed,
        note="Order confirmed - sent to kitchen"
    )
    db.add(history)

    store_result = await db.execute(select(Store).where(Store.id == order.store_id))
    store = store_result.scalar_one_or_none()

    if store and store.pos_integration_enabled:
        await _send_order_to_pos(order)
    else:
        logger.info(f"Order {order.order_number} confirmed in manual mode (store {order.store_id} POS integration disabled)")

    notif = Notification(
        user_id=order.user_id,
        title="Order Confirmed",
        body=f"Your order {order.order_number} has been sent to the kitchen!",
        type="order",
    )
    db.add(notif)
    await db.flush()

    return {
        "message": "Order confirmed and sent to kitchen",
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status.value,
        "order_type": order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type),
    }


@router.post("/{order_id}/apply-voucher")
async def apply_voucher_to_order(
    order_id: int,
    req: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply a voucher to an existing order (before payment).
    This is used in checkout flow for orders that haven't been paid yet.
    """
    voucher_code = req.get("voucher_code")
    if not voucher_code:
        raise HTTPException(status_code=400, detail="voucher_code is required")

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.user_id != user.id and not is_global_admin(user):
        raise HTTPException(status_code=403, detail="Cannot modify this order")

    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot apply voucher to order in status: {order.status}. Must be pending."
        )

    if order.voucher_code or order.voucher_discount > 0:
        raise HTTPException(status_code=400, detail="Voucher already applied to this order")

    now = datetime.now(timezone.utc)
    uv_result = await db.execute(
        select(UserVoucher).where(
            UserVoucher.code == voucher_code,
            UserVoucher.user_id == user.id,
        )
    )
    uv = uv_result.scalar_one_or_none()

    if not uv:
        raise HTTPException(status_code=404, detail="Voucher not found")

    if uv.status != "available":
        raise HTTPException(status_code=400, detail=f"Voucher is {uv.status}")

    if uv.expires_at and uv.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="Voucher has expired")

    subtotal = to_float(order.subtotal)
    delivery_fee = to_float(order.delivery_fee)
    min_spend = to_float(uv.min_spend) if uv.min_spend else 0

    if min_spend and subtotal < min_spend:
        raise HTTPException(status_code=400, detail=f"Minimum spend RM{min_spend:.0f} required")

    discount_type = uv.discount_type
    discount_value = to_float(uv.discount_value) if uv.discount_value else 0

    voucher_discount = 0.0
    if discount_type == "percent":
        voucher_discount = round(subtotal * discount_value / 100, 2)
    elif discount_type in ("fixed", "free_item"):
        voucher_discount = discount_value

    voucher_discount = min(voucher_discount, subtotal + delivery_fee)

    order.voucher_code = voucher_code
    order.voucher_discount = voucher_discount
    order.discount = round(voucher_discount + to_float(order.reward_discount), 2)
    order.total = round(subtotal + delivery_fee - order.discount, 2)

    uv.status = "used"
    uv.used_at = now
    uv.order_id = order.id

    await db.flush()

    return {
        "message": "Voucher applied successfully",
        "voucher_code": voucher_code,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_applied": voucher_discount,
        "new_total": to_float(order.total),
    }
