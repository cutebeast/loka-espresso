"""Admin order management endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.order import (
    OrderAdjustmentOut,
    OrderFulfillmentOut,
    OrderLineItemOut,
    OrderOut,
    OrderStatusLogOut,
)

router = APIRouter(prefix="/admin/orders", tags=["admin — orders"])

ORDER_STATUSES = [
    "pending", "confirmed", "preparing", "ready_for_pickup",
    "out_for_delivery", "delivered", "cancelled_by_customer",
    "cancelled_by_merchant", "refunded", "partially_refunded", "disputed",
]


def _build_order_out(order: Order) -> OrderOut:
    """Build OrderOut from Order model."""
    order_dict = {c: getattr(order, c) for c in order.__table__.columns.keys()}
    return OrderOut.model_validate(order_dict)


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_orders(
    admin: CurrentAdmin,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    order_type: str | None = Query(None),
    store_id: int | None = Query(None),
    search: str | None = Query(None, description="Search by order number"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List all orders with pagination and filters (admin view)."""
    base_stmt = select(Order).options(
        joinedload(Order.customer),
        joinedload(Order.store),
    ).where(Order.deleted_at.is_(None))

    count_stmt = select(func.count(Order.id)).where(Order.deleted_at.is_(None))

    if status_filter:
        base_stmt = base_stmt.where(Order.status == status_filter)
        count_stmt = count_stmt.where(Order.status == status_filter)
    if order_type:
        base_stmt = base_stmt.where(Order.order_type == order_type)
        count_stmt = count_stmt.where(Order.order_type == order_type)
    if store_id:
        base_stmt = base_stmt.where(Order.store_id == store_id)
        count_stmt = count_stmt.where(Order.store_id == store_id)
    if search:
        base_stmt = base_stmt.where(Order.order_number.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(Order.order_number.ilike(f"%{search}%"))
    if date_from:
        try:
            dfrom = datetime.fromisoformat(date_from)
            base_stmt = base_stmt.where(Order.created_at >= dfrom)
            count_stmt = count_stmt.where(Order.created_at >= dfrom)
        except ValueError:
            pass
    if date_to:
        try:
            dto = datetime.fromisoformat(date_to)
            base_stmt = base_stmt.where(Order.created_at <= dto)
            count_stmt = count_stmt.where(Order.created_at <= dto)
        except ValueError:
            pass

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base_stmt.order_by(Order.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    orders = result.unique().scalars().all()

    items = []
    for order in orders:
        item = {
            "id": order.id,
            "order_number": order.order_number,
            "customer_id": order.customer_id,
            "customer_name": order.customer.display_name if order.customer else "Unknown",
            "store_id": order.store_id,
            "store_name": order.store.store_name if order.store else "Unknown",
            "order_type": order.order_type,
            "status": order.status,
            "payment_status": order.payment_status,
            "item_count": order.item_count,
            "total_amount": float(order.total_amount),
            "total_amount_currency": order.total_amount_currency,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        }
        items.append(item)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )


@router.get("/{order_id}", response_model=APIResponse[OrderOut])
async def get_order_detail(admin: CurrentAdmin, db: DBDependency, order_id: int):
    """Get order detail."""
    result = await db.execute(
        select(Order)
        .options(joinedload(Order.customer), joinedload(Order.store))
        .where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.unique().scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    order_out = _build_order_out(order)

    # Line items
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    order_out.line_items = [
        OrderLineItemOut.model_validate(i) for i in li_result.scalars().all()
    ]

    # Status log
    sl_result = await db.execute(
        select(OrderStatusLog)
        .where(OrderStatusLog.order_id == order.id)
        .order_by(OrderStatusLog.created_at.desc())
    )
    order_out.status_log = [
        OrderStatusLogOut.model_validate(i) for i in sl_result.scalars().all()
    ]

    # Adjustments
    adj_result = await db.execute(
        select(OrderAdjustment).where(OrderAdjustment.order_id == order.id)
    )
    order_out.adjustments = [
        OrderAdjustmentOut.model_validate(i) for i in adj_result.scalars().all()
    ]

    # Fulfillment
    ff_result = await db.execute(
        select(OrderFulfillment).where(OrderFulfillment.order_id == order.id)
    )
    fulfillment = ff_result.scalar_one_or_none()
    if fulfillment:
        order_out.fulfillment = OrderFulfillmentOut.model_validate(fulfillment)

    return APIResponse(data=order_out)


@router.patch("/{order_id}/status", response_model=APIResponse[dict])
async def update_order_status(
    admin: CurrentAdmin,
    db: DBDependency,
    order_id: int,
    data: dict,
):
    """Update order status (admin)."""
    status_value = data.get("status")
    if not status_value:
        raise HTTPException(status_code=400, detail="status is required")
    if status_value not in ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid: {ORDER_STATUSES}",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.deleted_at.is_(None))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    from_status = order.status

    # Update timestamp based on status
    now = datetime.now(timezone.utc)
    if status_value == "confirmed":
        order.confirmed_at = now
    elif status_value == "preparing":
        order.prepared_at = now
    elif status_value in ("delivered", "completed"):
        order.completed_at = now
    elif status_value in ("cancelled_by_customer", "cancelled_by_merchant"):
        order.cancelled_at = now

    order.status = status_value
    order.updated_at = now

    # Log status change
    log = OrderStatusLog(
        order_id=order.id,
        from_status=from_status,
        to_status=status_value,
        reason=data.get("reason", "Admin status update"),
        actor_type="staff",
        actor_id=admin.id,
    )
    db.add(log)
    await db.commit()
    await db.refresh(order)

    return APIResponse(
        data={
            "id": order.id,
            "status": order.status,
            "from_status": from_status,
            "message": f"Order {order.order_number} status updated to {status_value}",
        }
    )
