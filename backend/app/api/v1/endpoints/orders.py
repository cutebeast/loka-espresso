import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.audit import log_action
from app.models.user import User
from app.models.order import Order, OrderStatusHistory, OrderType, OrderStatus, CartItem
from app.models.menu import MenuItem
from app.models.loyalty import LoyaltyAccount, LoyaltyTransaction
from app.models.notification import Notification
from app.schemas.order import OrderCreate, OrderOut, OrderStatusUpdate, OrderListOut

router = APIRouter(prefix="/orders", tags=["Orders"])


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

    store_id = req.store_id or cart_items[0].store_id
    order_items = []
    subtotal = 0.0
    for ci in cart_items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
        mi = ir.scalar_one_or_none()
        name = mi.name if mi else "Unknown"
        price = float(ci.unit_price)
        order_items.append({
            "item_id": ci.item_id, "name": name, "quantity": ci.quantity,
            "unit_price": price, "customizations": ci.customizations,
            "line_total": round(price * ci.quantity, 2),
        })
        subtotal += price * ci.quantity

    delivery_fee = 0.0
    if req.order_type == OrderType.delivery:
        from app.models.splash import AppConfig
        cfg = await db.execute(select(AppConfig).where(AppConfig.key == "delivery_fee"))
        fee_row = cfg.scalar_one_or_none()
        delivery_fee = float(fee_row.value) if fee_row else 3.0

    discount = 0.0
    total = round(subtotal + delivery_fee - discount, 2)
    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"

    order = Order(
        user_id=user.id, store_id=store_id, table_id=req.table_id,
        order_number=order_number, order_type=req.order_type,
        items=order_items, subtotal=round(subtotal, 2),
        delivery_fee=round(delivery_fee, 2), discount=round(discount, 2),
        total=total, status=OrderStatus.pending,
        pickup_time=req.pickup_time, delivery_address=req.delivery_address,
        payment_method=req.payment_method, notes=req.notes,
    )
    db.add(order)
    await db.flush()

    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.pending, note="Order placed")
    db.add(history)

    for ci in cart_items:
        await db.delete(ci)

    la_result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user.id))
    la = la_result.scalar_one_or_none()
    if la:
        earn_rate = 1
        points = int(total * earn_rate)
        la.points_balance += points
        la.total_points_earned += points
        lt = LoyaltyTransaction(
            user_id=user.id, order_id=order.id, store_id=store_id,
            points=points, type="earn",
        )
        db.add(lt)
        order.loyalty_points_earned = points

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
        subtotal=float(order.subtotal), delivery_fee=float(order.delivery_fee),
        discount=float(order.discount), total=float(order.total),
        status=order.status, pickup_time=order.pickup_time,
        delivery_address=order.delivery_address, payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned,
        notes=order.notes, created_at=order.created_at, updated_at=order.updated_at,
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
            subtotal=float(o.subtotal), delivery_fee=float(o.delivery_fee),
            discount=float(o.discount), total=float(o.total),
            status=o.status, pickup_time=o.pickup_time,
            delivery_address=o.delivery_address, payment_method=o.payment_method,
            payment_status=o.payment_status,
            loyalty_points_earned=o.loyalty_points_earned,
            notes=o.notes, created_at=o.created_at, updated_at=o.updated_at,
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
    if order.user_id != user.id and user.role not in ("admin", "store_owner"):
        raise HTTPException(status_code=403, detail="Forbidden")
    hist_result = await db.execute(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id).order_by(OrderStatusHistory.created_at)
    )
    timeline = [{"status": h.status.value if hasattr(h.status, 'value') else str(h.status), "note": h.note, "created_at": h.created_at.isoformat() if h.created_at else None} for h in hist_result.scalars().all()]
    return OrderOut(
        id=order.id, user_id=order.user_id, store_id=order.store_id,
        table_id=order.table_id, order_number=order.order_number,
        order_type=order.order_type, items=order.items,
        subtotal=float(order.subtotal), delivery_fee=float(order.delivery_fee),
        discount=float(order.discount), total=float(order.total),
        status=order.status, pickup_time=order.pickup_time,
        delivery_address=order.delivery_address, payment_method=order.payment_method,
        payment_status=order.payment_status,
        loyalty_points_earned=order.loyalty_points_earned,
        notes=order.notes, created_at=order.created_at, updated_at=order.updated_at,
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
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in (OrderStatus.completed, OrderStatus.cancelled):
        raise HTTPException(status_code=400, detail="Cannot cancel this order")
    order.status = OrderStatus.cancelled
    history = OrderStatusHistory(order_id=order.id, status=OrderStatus.cancelled, note="Cancelled by user")
    db.add(history)
    await db.flush()
    return {"message": "Order cancelled"}


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: int, req: OrderStatusUpdate,
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    old_status = order.status.value if hasattr(order.status, 'value') else str(order.status)
    new_status = req.status.value if hasattr(req.status, 'value') else str(req.status)
    order.status = req.status
    history = OrderStatusHistory(order_id=order.id, status=req.status, note=req.note)
    db.add(history)
    notif = Notification(
        user_id=order.user_id, title=f"Order {new_status}",
        body=f"Your order {order.order_number} is now {new_status}",
        type="order",
    )
    db.add(notif)
    await log_action(db, action="ORDER_STATUS_CHANGE", user_id=user.id, store_id=order.store_id, entity_type="order", entity_id=order.id, details={"order_number": order.order_number, "from": old_status, "to": new_status})
    await db.flush()
    return {"message": f"Order status updated to {new_status}"}
