"""Customer order endpoints."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.order import (
    OrderAdjustmentOut,
    OrderCreate,
    OrderFulfillmentOut,
    OrderLineItemOut,
    OrderListParams,
    OrderOut,
    OrderStatusLogOut,
)
from app.services.order import OrderError, create_order_from_cart, get_customer_orders

router = APIRouter(prefix="/orders", tags=["orders"])


def _build_order_out(order: Order, db) -> OrderOut:
    """Build OrderOut from Order model without lazy loading."""
    order_dict = {c: getattr(order, c) for c in order.__table__.columns.keys()}
    order_out = OrderOut.model_validate(order_dict)
    return order_out


@router.post("", response_model=APIResponse[OrderOut], status_code=status.HTTP_201_CREATED)
async def create_order(
    customer: ActiveCustomer,
    db: DBDependency,
    data: OrderCreate,
):
    """Create a new order from the customer's cart."""
    try:
        order = await create_order_from_cart(db, customer.id, data)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    
    # Fetch line items
    result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    line_items = result.scalars().all()
    
    order_out = _build_order_out(order, db)
    order_out.line_items = [OrderLineItemOut.model_validate(i) for i in line_items]
    
    return APIResponse(data=order_out)


@router.get("", response_model=APIResponse[PaginatedResponse[OrderOut]])
async def list_orders(
    customer: ActiveCustomer,
    db: DBDependency,
    status: str | None = Query(None),
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List customer's orders."""
    orders, total = await get_customer_orders(
        db, customer.id, status=status, page=page, per_page=per_page
    )
    
    items = []
    for order in orders:
        order_out = _build_order_out(order, db)
        items.append(order_out)
    
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/{order_id}", response_model=APIResponse[OrderOut])
async def get_order(customer: ActiveCustomer, db: DBDependency, order_id: int):
    """Get order details by ID."""
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.customer_id == customer.id,
            Order.deleted_at.is_(None),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order_out = _build_order_out(order, db)
    
    # Fetch line items
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    order_out.line_items = [OrderLineItemOut.model_validate(i) for i in li_result.scalars().all()]
    
    # Fetch status logs
    sl_result = await db.execute(
        select(OrderStatusLog).where(OrderStatusLog.order_id == order.id)
    )
    order_out.status_log = [OrderStatusLogOut.model_validate(i) for i in sl_result.scalars().all()]
    
    # Fetch adjustments
    adj_result = await db.execute(
        select(OrderAdjustment).where(OrderAdjustment.order_id == order.id)
    )
    order_out.adjustments = [OrderAdjustmentOut.model_validate(i) for i in adj_result.scalars().all()]
    
    # Fetch fulfillment
    ff_result = await db.execute(
        select(OrderFulfillment).where(OrderFulfillment.order_id == order.id)
    )
    fulfillment = ff_result.scalar_one_or_none()
    if fulfillment:
        order_out.fulfillment = OrderFulfillmentOut.model_validate(fulfillment)
    
    return APIResponse(data=order_out)
