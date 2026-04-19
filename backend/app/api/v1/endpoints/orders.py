import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_hq_access, is_global_admin, is_hq, can_access_store
from app.core.audit import log_action
from app.core.utils import to_float
from app.models.user import User, UserTypeIDs, RoleIDs
from app.models.order import Order, OrderStatusHistory, OrderType, OrderStatus, CartItem, OrderItem
from app.models.menu import MenuItem
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction, LoyaltyTier
from app.models.notification import Notification
from app.models.voucher import UserVoucher
from app.models.reward import UserReward
from app.models.splash import AppConfig
from app.schemas.order import OrderCreate, OrderOut, OrderStatusUpdate, OrderListOut

router = APIRouter(prefix="/orders", tags=["Orders"])

# Valid status transitions by order type
# Flow A (Pickup & Delivery): pending -> paid -> confirmed -> preparing -> ready -> (out_for_delivery) -> completed
# Flow B (Dine-in): pending -> confirmed -> preparing -> ready -> completed (payment happens at the end)
VALID_TRANSITIONS = {
    "pending": ["paid", "confirmed", "cancelled"],
    "paid": ["confirmed", "cancelled"],
    "confirmed": ["preparing", "cancelled"],
    "preparing": ["ready", "cancelled"],
    "ready": ["out_for_delivery", "completed", "cancelled"],
    "out_for_delivery": ["completed", "cancelled"],
}

# Flow-specific validation rules
FLOW_A_TYPES = {"pickup", "delivery"}  # Pay first, then confirm
FLOW_B_TYPES = {"dine_in"}  # Confirm first, pay at the end


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    req: OrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cart_result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    cart_items = cart_result.scalars().all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    if req.order_type == OrderType.dine_in and not req.table_id:
        raise HTTPException(status_code=400, detail="table_id required for dine_in")
    if req.order_type == OrderType.pickup and not req.pickup_time:
        raise HTTPException(status_code=400, detail="pickup_time required for pickup")
    if req.order_type == OrderType.delivery and not req.delivery_address:
        raise HTTPException(status_code=400, detail="delivery_address required for delivery")

    if req.voucher_code and getattr(req, 'reward_redemption_code', None):
        raise HTTPException(status_code=400, detail="Only one discount allowed per order")

    store_id = req.store_id or cart_items[0].store_id

    for ci in cart_items:
        if ci.store_id != store_id:
            raise HTTPException(status_code=400, detail="All cart items must be from the same store")

    order_items = []
    subtotal = 0.0
    for ci in cart_items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
        mi = ir.scalar_one_or_none()
        if not mi:
            raise HTTPException(status_code=400, detail=f"Menu item {ci.item_id} not found")
        if mi.store_id != 0 and mi.store_id != store_id:
            raise HTTPException(
                status_code=400,
                detail=f"Item '{mi.name}' belongs to store {mi.store_id}, not store {store_id}",
            )
        name = mi.name
        price = to_float(ci.unit_price)
        order_items.append({
            "item_id": ci.item_id, "name": name, "quantity": ci.quantity,
            "unit_price": price, "customizations": ci.customizations,
            "line_total": round(price * ci.quantity, 2),
        })
        subtotal += price * ci.quantity

    delivery_fee = 0.0
    delivery_provider = None
    if req.order_type == OrderType.delivery:
        from app.models.splash import AppConfig
        cfg = await db.execute(select(AppConfig).where(AppConfig.key == "delivery_fee"))
        fee_row = cfg.scalar_one_or_none()
        delivery_fee = float(fee_row.value) if fee_row else 3.0
        delivery_provider = getattr(req, 'delivery_provider', None) or "internal"

    voucher_discount = 0.0
    reward_discount = 0.0
    used_voucher_code = None
    used_reward_code = None

    if req.voucher_code:
        uv_result = await db.execute(
            select(UserVoucher).where(
                UserVoucher.code == req.voucher_code,
                UserVoucher.user_id == user.id,
            )
        )
        uv = uv_result.scalar_one_or_none()
        if not uv:
            raise HTTPException(status_code=400, detail="Voucher not found")
        if uv.status != "available":
            raise HTTPException(status_code=400, detail=f"Voucher is {uv.status}")
        from app.core.security import now_utc, ensure_utc
        now = now_utc()
        if uv.expires_at and ensure_utc(uv.expires_at) < now:
            raise HTTPException(status_code=400, detail="Voucher has expired")

        disc_type = uv.discount_type
        disc_value = to_float(uv.discount_value) if uv.discount_value else 0
        min_spend = to_float(uv.min_spend) if uv.min_spend else 0

        if min_spend and subtotal < min_spend:
            raise HTTPException(status_code=400, detail=f"Minimum spend RM{min_spend:.0f} required")

        if disc_type == "percent":
            voucher_discount = round(subtotal * disc_value / 100, 2)
        elif disc_type in ("fixed", "free_item"):
            voucher_discount = disc_value

        voucher_discount = min(voucher_discount, subtotal + delivery_fee)
        used_voucher_code = req.voucher_code
        uv.status = "used"
        uv.used_at = datetime.now(timezone.utc)
        uv.order_id = None

    elif getattr(req, 'reward_redemption_code', None):
        ur_result = await db.execute(
            select(UserReward).where(
                UserReward.redemption_code == req.reward_redemption_code,
                UserReward.user_id == user.id,
            )
        )
        ur = ur_result.scalar_one_or_none()
        if not ur:
            raise HTTPException(status_code=400, detail="Reward not found")
        if ur.status != "available":
            raise HTTPException(status_code=400, detail=f"Reward is {ur.status}")

        from app.models.reward import Reward
        r_result = await db.execute(select(Reward).where(Reward.id == ur.reward_id))
        reward = r_result.scalar_one_or_none()
        if not reward:
            raise HTTPException(status_code=400, detail="Reward not found")

        disc_value = to_float(reward.discount_value) if reward.discount_value else 0
        if disc_value:
            reward_discount = min(disc_value, subtotal + delivery_fee - voucher_discount)

        used_reward_code = req.reward_redemption_code
        ur.status = "used"
        ur.used_at = datetime.now(timezone.utc)
        ur.is_used = True
        ur.order_id = None

    discount = round(voucher_discount + reward_discount, 2)
    total = round(subtotal + delivery_fee - discount, 2)
    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"

    order = Order(
        user_id=user.id, store_id=store_id, table_id=req.table_id,
        order_number=order_number, order_type=req.order_type,
        items=order_items, subtotal=round(subtotal, 2),
        delivery_fee=round(delivery_fee, 2), discount=round(discount, 2),
        voucher_discount=round(voucher_discount, 2),
        reward_discount=round(reward_discount, 2),
        loyalty_discount=0.0,
        voucher_code=used_voucher_code,
        reward_redemption_code=used_reward_code,
        total=total, status=OrderStatus.pending,
        pickup_time=req.pickup_time, delivery_address=req.delivery_address,
        payment_method=req.payment_method, notes=req.notes,
        delivery_provider=delivery_provider,
    )
    if req.created_at:
        order.created_at = req.created_at
    db.add(order)
    await db.flush()

    for oi in order_items:
        oi_record = OrderItem(
            order_id=order.id,
            menu_item_id=oi.get("item_id"),
            name=oi["name"],
            quantity=oi["quantity"],
            unit_price=oi["unit_price"],
            customizations=oi.get("customizations"),
            line_total=oi["line_total"],
        )
        if req.created_at:
            oi_record.created_at = req.created_at
        db.add(oi_record)

    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.pending, note="Order placed")
    if req.created_at:
        history.created_at = req.created_at
    db.add(history)

    for ci in cart_items:
        await db.delete(ci)

    notif = Notification(
        user_id=user.id, title="Order Placed",
        body=f"Your order {order_number} has been placed!",
        type="order", is_read=False,
    )
    db.add(notif)
    await db.flush()

    return OrderOut(
        id=order.id, user_id=order.user_id, store_id=order.store_id,
        table_id=order.table_id, order_number=order.order_number,
        order_type=order.order_type, items=order.items,
        subtotal=to_float(order.subtotal), delivery_fee=to_float(order.delivery_fee),
        discount=to_float(order.discount), total=to_float(order.total),
        status=order.status, pickup_time=order.pickup_time,
        delivery_address=order.delivery_address, payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned,
        notes=order.notes, delivery_provider=order.delivery_provider,
        created_at=order.created_at, updated_at=order.updated_at,
    )


@router.get("", response_model=OrderListOut)
async def list_orders(
    page: int = 1, page_size: int = 20,
    store_id: int | None = None,
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Admins can see all orders, regular users only see their own
    if is_global_admin(user) or is_hq(user):
        q = select(Order).order_by(Order.created_at.desc())
    else:
        q = select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    
    if store_id:
        q = q.where(Order.store_id == store_id)
    if status:
        q = q.where(Order.status == status)
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))
    orders = result.scalars().all()
    out = []
    for o in orders:
        out.append(OrderOut(
            id=o.id, user_id=o.user_id, store_id=o.store_id,
            table_id=o.table_id, order_number=o.order_number,
            order_type=o.order_type, items=o.items,
            subtotal=to_float(o.subtotal), delivery_fee=to_float(o.delivery_fee),
            discount=to_float(o.discount), total=to_float(o.total),
            status=o.status, pickup_time=o.pickup_time,
            delivery_address=o.delivery_address, payment_method=o.payment_method,
            payment_status=o.payment_status,
            loyalty_points_earned=o.loyalty_points_earned,
            notes=o.notes, delivery_provider=o.delivery_provider,
            created_at=o.created_at, updated_at=o.updated_at,
        ))
    return OrderListOut(orders=out, total=total, page=page, page_size=page_size)


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id and not is_global_admin(user):
        # Check if user has access to order's store
        if not await can_access_store(user, order.store_id, db):
            raise HTTPException(status_code=403, detail="Forbidden")
    hist_result = await db.execute(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id).order_by(OrderStatusHistory.created_at)
    )
    timeline = [{"status": h.status.value if hasattr(h.status, 'value') else str(h.status), "note": h.note, "created_at": h.created_at.isoformat() if h.created_at else None} for h in hist_result.scalars().all()]
    return OrderOut(
        id=order.id, user_id=order.user_id, store_id=order.store_id,
        table_id=order.table_id, order_number=order.order_number,
        order_type=order.order_type, items=order.items,
        subtotal=to_float(order.subtotal), delivery_fee=to_float(order.delivery_fee),
        discount=to_float(order.discount), total=to_float(order.total),
        status=order.status, pickup_time=order.pickup_time,
        delivery_address=order.delivery_address, payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned,
        notes=order.notes, delivery_provider=order.delivery_provider,
        created_at=order.created_at, updated_at=order.updated_at,
        status_timeline=timeline,
    )


@router.post("/{order_id}/reorder")
async def reorder(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    for item_data in order.items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == item_data.get("item_id")))
        mi = ir.scalar_one_or_none()
        if not mi:
            continue
        existing = await db.execute(
            select(CartItem).where(CartItem.user_id == user.id, CartItem.item_id == mi.id)
        )
        ci = existing.scalar_one_or_none()
        if ci:
            ci.quantity += item_data.get("quantity", 1)
        else:
            ci = CartItem(
                user_id=user.id, store_id=order.store_id, item_id=mi.id,
                quantity=item_data.get("quantity", 1),
                customizations=item_data.get("customizations"),
                unit_price=mi.base_price,
            )
            db.add(ci)
    await db.flush()
    return {"message": "Items added to cart"}


@router.post("/{order_id}/cancel")
async def cancel_order(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not is_global_admin(user) and order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot cancel another user's order")
    if order.status in (OrderStatus.completed, OrderStatus.cancelled):
        raise HTTPException(status_code=400, detail="Cannot cancel this order")
    order.status = OrderStatus.cancelled
    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.cancelled, note="Cancelled by user")
    db.add(history)

    if order.payment_status == "paid" and order.loyalty_points_earned and order.loyalty_points_earned > 0:
        la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id))
        la = la_result.scalar_one_or_none()
        if la:
            await db.execute(
                update(LoyaltyAccount)
                .where(LoyaltyAccount.user_id == order.user_id)
                .values(
                    points_balance=LoyaltyAccount.points_balance - order.loyalty_points_earned,
                    total_points_earned=LoyaltyAccount.total_points_earned - order.loyalty_points_earned,
                )
            )
            lt = LoyaltyTransaction(
                user_id=order.user_id, order_id=order.id, store_id=order.store_id,
                points=-order.loyalty_points_earned, type="redeem",
                description=f"Points reversed: order {order.order_number} cancelled",
            )
            db.add(lt)
        order.loyalty_points_earned = 0

    if order.payment_status == "paid":
        order.payment_status = "refunded"
        from app.models.order import Payment
        p_result = await db.execute(select(Payment).where(Payment.order_id == order.id))
        payment = p_result.scalar_one_or_none()
        if payment:
            payment.status = "refunded"

    await db.flush()
    return {"message": "Order cancelled", "loyalty_reversed": order.payment_status == "paid"}


@router.post("/{order_id}/confirm")
async def confirm_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm a dine-in order to send it to the kitchen/POS.
    This is used in Flow B (dine-in) where confirmation happens BEFORE payment.
    Flow A (pickup/delivery) orders must be paid first and will auto-confirm.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Only order owner or authorized staff can confirm
    if order.user_id != user.id and not await can_access_store(user, order.store_id, db):
        raise HTTPException(status_code=403, detail="Cannot confirm this order")

    # Only dine-in orders can use this endpoint
    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    if order_type not in FLOW_B_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Order confirmation endpoint is only for dine-in orders. {order_type} orders must be paid first."
        )

    # Must be in pending status to confirm
    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm order in status: {order.status}. Must be pending."
        )

    # Update status to confirmed
    order.status = OrderStatus.confirmed
    history = OrderStatusHistory(
        order_id=order.id,
        status=OrderStatus.confirmed,
        note="Order confirmed by customer - sent to kitchen"
    )
    db.add(history)

    # Send to external POS
    await _send_order_to_pos(order)

    # Notify customer
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
    }


async def _send_order_to_pos(order: Order):
    """Send order to external POS system (mock integration)."""
    try:
        import httpx
        pos_url = "http://localhost:8081/api/v1/orders"
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
    except Exception:
        # POS integration is best-effort, do not fail the order if POS is down
        pass


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

    # Get the order
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verify user owns the order
    if order.user_id != user.id and not is_global_admin(user):
        raise HTTPException(status_code=403, detail="Cannot modify this order")

    # Only pending orders can have vouchers applied
    if order.status != OrderStatus.pending:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot apply voucher to order in status: {order.status}. Must be pending."
        )

    # Check if voucher already applied
    if order.voucher_code or order.voucher_discount > 0:
        raise HTTPException(status_code=400, detail="Voucher already applied to this order")

    # Find and validate the voucher
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

    # Calculate discount
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

    # Cap discount at subtotal + delivery_fee
    voucher_discount = min(voucher_discount, subtotal + delivery_fee)

    # Update order
    order.voucher_code = voucher_code
    order.voucher_discount = voucher_discount
    order.discount = round(voucher_discount + to_float(order.reward_discount), 2)
    order.total = round(subtotal + delivery_fee - order.discount, 2)

    # Mark voucher as used
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


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: int, req: OrderStatusUpdate,
    user: User = Depends(get_current_user),
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

    valid_next = VALID_TRANSITIONS.get(old_status, [])
    if new_status not in valid_next:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition: {old_status} -> {new_status}. Valid: {valid_next}"
        )

    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)

    # Flow-specific validations for status transitions
    if new_status == "confirmed":
        if order_type in FLOW_A_TYPES and old_status != "paid":
            # Flow A: pickup/delivery must be paid before confirmed
            raise HTTPException(
                status_code=400,
                detail=f"{order_type} orders must be paid before confirmation. Current status: {old_status}"
            )
        elif order_type in FLOW_B_TYPES and old_status != "pending":
            # Flow B: dine-in must use confirm endpoint from pending
            raise HTTPException(
                status_code=400,
                detail="Dine-in orders must use POST /orders/{id}/confirm from pending status"
            )

    # Flow B: dine-in can only be completed if payment_status is paid
    if new_status == "completed" and order_type in FLOW_B_TYPES:
        if order.payment_status != "paid":
            raise HTTPException(
                status_code=400,
                detail="Dine-in order cannot be completed until payment is made"
            )

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
    await log_action(db, action="ORDER_STATUS_CHANGE", user_id=user.id, store_id=order.store_id, entity_type="order", entity_id=order.id, details={"order_number": order.order_number, "from": old_status, "to": new_status})
    await db.flush()
    return {
        "message": f"Order status updated to {new_status}",
        "discounts_applied": {
            "voucher_discount": to_float(order.voucher_discount),
            "reward_discount": to_float(order.reward_discount),
            "loyalty_discount": to_float(order.loyalty_discount),
        },
        "new_total": to_float(order.total),
        "loyalty_points_earned": order.loyalty_points_earned,
    }


@router.patch("/{order_id}/payment-status")
async def update_order_payment_status(
    order_id: int,
    req: dict,
    user: User = Depends(get_current_user),
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
    # Check if user has permission to update this order's payment
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check access - admin, hq, or store staff with access to this store
    has_access = is_global_admin(user) or is_hq(user) or await can_access_store(user, order.store_id, db)
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to update payment for this order")

    payment_status = req.get("payment_status")
    if not payment_status:
        raise HTTPException(status_code=400, detail="payment_status is required")

    old_payment_status = order.payment_status
    order.payment_status = payment_status
    
    # For Flow A (pickup/delivery), also update order status to "paid"
    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    if payment_status == "paid" and order_type in FLOW_A_TYPES:
        order.status = OrderStatus.paid

    # If payment is marked as paid, award loyalty points
    points_earned = 0
    if payment_status == "paid" and old_payment_status != "paid":
        # Get loyalty config
        cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "loyalty_points_per_rmse"))
        cfg_row = cfg_result.scalar_one_or_none()
        earn_rate = int(cfg_row.value) if cfg_row else 1
        
        # Get customer's loyalty account
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id)
        )
        la = la_result.scalar_one_or_none()
        
        # Get tier multiplier
        multiplier = 1.0
        tier_name = "bronze"
        if la:
            tier_name = la.tier
            tier_result = await db.execute(
                select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
            )
            tier = tier_result.scalar_one_or_none()
            if tier:
                multiplier = float(tier.points_multiplier)
        
        # Calculate points: amount * earn_rate * multiplier
        points = int(float(order.total) * earn_rate * multiplier)
        
        if points > 0:
            if la:
                # Update existing loyalty account
                la.points_balance += points
                la.total_points_earned += points
            else:
                # Create new loyalty account
                la = LoyaltyAccount(
                    user_id=order.user_id, 
                    points_balance=points, 
                    tier=tier_name, 
                    total_points_earned=points
                )
                db.add(la)
            
            # Create loyalty transaction
            lt = LoyaltyTransaction(
                user_id=order.user_id,
                order_id=order.id,
                store_id=order.store_id,
                points=points,
                type="earn",
                description=f"Points earned for order {order.order_number}",
            )
            db.add(lt)
            order.loyalty_points_earned = points
            points_earned = points
            
            # Check for tier promotion
            if la:
                lifetime = la.total_points_earned
                tier_result = await db.execute(
                    select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
                )
                current_tier = tier_result.scalar_one_or_none()
                current_tier_name = current_tier.name if current_tier else la.tier
                
                # Find new tier based on lifetime points
                tier_promotion_result = await db.execute(
                    select(LoyaltyTier).where(LoyaltyTier.min_points <= lifetime).order_by(LoyaltyTier.min_points.desc()).limit(1)
                )
                new_tier = tier_promotion_result.scalar_one_or_none()
                if new_tier and new_tier.name != current_tier_name:
                    la.tier = new_tier.name

    await db.flush()
    return {
        "message": f"Order payment status updated to {payment_status}",
        "order_id": order.id,
        "payment_status": payment_status,
        "loyalty_points_earned": points_earned,
    }


# ============================================================================
# DELIVERY PROVIDER WEBHOOK
# ============================================================================

@router.post("/{order_id}/delivery-webhook")
async def delivery_provider_webhook(
    order_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for 3rd party Delivery Provider to notify of delivery status.
    This is called by the delivery provider when:
    - Driver picks up order (status: picked_up)
    - Order is out for delivery (status: out_for_delivery)
    - Delivery is completed (status: delivered)
    - Delivery fails (status: failed)
    
    Authentication: Uses API key in header (X-API-Key) - to be implemented per provider
    """
    # TODO: Add API key validation here
    
    # Get the order
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Only delivery orders can use this webhook
    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    if order_type != "delivery":
        raise HTTPException(status_code=400, detail="This webhook is only for delivery orders")
    
    delivery_status = payload.get("status")
    delivery_id = payload.get("delivery_id")
    driver_info = payload.get("driver", {})
    
    if not delivery_status:
        raise HTTPException(status_code=400, detail="status is required")
    
    # Map delivery provider status to order status
    status_mapping = {
        "picked_up": "out_for_delivery",
        "out_for_delivery": "out_for_delivery",
        "delivered": "completed",
        "failed": "ready",  # Return to ready state if delivery fails
        "cancelled": "ready",
    }
    
    new_status = status_mapping.get(delivery_status)
    if not new_status:
        return {
            "message": f"Status '{delivery_status}' received but no action taken",
            "order_id": order_id,
        }
    
    # Update order status
    old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)
    
    # Validate transition
    if new_status != old_status:
        order.status = new_status
        
        # Add status history
        history = OrderStatusHistory(
            order_id=order.id,
            status=new_status,
            note=f"Delivery webhook: {delivery_status} (Driver: {driver_info.get('name', 'Unknown')})",
        )
        db.add(history)
        
        # Send notification to customer
        if delivery_status == "delivered":
            notif = Notification(
                user_id=order.user_id,
                title="Order Delivered",
                body=f"Your order {order.order_number} has been delivered!",
                type="order",
            )
            db.add(notif)
        elif delivery_status == "out_for_delivery":
            notif = Notification(
                user_id=order.user_id,
                title="Out for Delivery",
                body=f"Your order {order.order_number} is on the way!",
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


# ============================================================================
# EXTERNAL POS WEBHOOK
# ============================================================================

@router.post("/{order_id}/pos-webhook")
async def external_pos_webhook(
    order_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for External POS system to notify of order status and payment.
    This is called by the external POS when:
    - Order is confirmed at POS (status: confirmed)
    - Kitchen starts preparing (status: preparing)
    - Food is ready (status: ready)
    - Payment is received (payment_status: paid)
    
    For dine-in orders, the POS handles the kitchen workflow and payment.
    """
    # TODO: Add API key validation here for POS authentication
    
    # Get the order
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    pos_status = payload.get("status")
    payment_status = payload.get("payment_status")
    pos_order_id = payload.get("pos_order_id")
    
    updated_fields = []
    
    # Handle status update from POS
    if pos_status:
        valid_statuses = ["confirmed", "preparing", "ready", "completed", "cancelled"]
        if pos_status in valid_statuses:
            old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)
            if pos_status != old_status:
                order.status = pos_status
                updated_fields.append(f"status: {pos_status}")
                
                # Add status history
                history = OrderStatusHistory(
                    order_id=order.id,
                    status=pos_status,
                    note=f"POS webhook update (POS Order: {pos_order_id})",
                )
                db.add(history)
    
    # Handle payment status update from POS
    if payment_status == "paid" and order.payment_status != "paid":
        order.payment_status = "paid"
        updated_fields.append("payment_status: paid")
        
        # Award loyalty points (same logic as payment-status endpoint)
        cfg_result = await db.execute(select(AppConfig).where(AppConfig.key == "loyalty_points_per_rmse"))
        cfg_row = cfg_result.scalar_one_or_none()
        earn_rate = int(cfg_row.value) if cfg_row else 1
        
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.user_id == order.user_id)
        )
        la = la_result.scalar_one_or_none()
        
        multiplier = 1.0
        tier_name = "bronze"
        if la:
            tier_name = la.tier
            tier_result = await db.execute(
                select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
            )
            tier = tier_result.scalar_one_or_none()
            if tier:
                multiplier = float(tier.points_multiplier)
        
        points = int(float(order.total) * earn_rate * multiplier)
        
        if points > 0:
            if la:
                la.points_balance += points
                la.total_points_earned += points
            else:
                la = LoyaltyAccount(
                    user_id=order.user_id,
                    points_balance=points,
                    tier=tier_name,
                    total_points_earned=points
                )
                db.add(la)
            
            lt = LoyaltyTransaction(
                user_id=order.user_id,
                order_id=order.id,
                store_id=order.store_id,
                points=points,
                type="earn",
                description=f"Points earned for order {order.order_number} (via POS)",
            )
            db.add(lt)
            order.loyalty_points_earned = points
            updated_fields.append(f"loyalty_points: {points}")
            
            # Check for tier promotion
            if la:
                lifetime = la.total_points_earned
                tier_result = await db.execute(
                    select(LoyaltyTier).where(func.lower(LoyaltyTier.name) == la.tier.lower())
                )
                current_tier = tier_result.scalar_one_or_none()
                current_tier_name = current_tier.name if current_tier else la.tier
                
                tier_promotion_result = await db.execute(
                    select(LoyaltyTier).where(LoyaltyTier.min_points <= lifetime).order_by(LoyaltyTier.min_points.desc()).limit(1)
                )
                new_tier = tier_promotion_result.scalar_one_or_none()
                if new_tier and new_tier.name != current_tier_name:
                    la.tier = new_tier.name
    
    await db.flush()
    
    return {
        "message": "POS webhook processed",
        "order_id": order_id,
        "updates": updated_fields,
    }
