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
from app.schemas.order import OrderCreate, OrderOut, OrderStatusUpdate, OrderListOut

router = APIRouter(prefix="/orders", tags=["Orders"])

VALID_TRANSITIONS = {
    "pending": ["paid", "cancelled"],
    "paid": ["confirmed", "cancelled"],
    "confirmed": ["preparing", "cancelled"],
    "preparing": ["ready", "cancelled"],
    "ready": ["out_for_delivery", "completed", "cancelled"],
    "out_for_delivery": ["completed", "cancelled"],
}


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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    if store_id:
        q = q.where(Order.store_id == store_id)
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
