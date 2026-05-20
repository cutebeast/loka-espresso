"""Customer order endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Body, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.models.cart import CustomerCart, CartLineItem
from app.models.order import Order, OrderAdjustment, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.payment import Payment
from app.models.store import Store
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
    raw_data: dict = Body(...),
):
    """Create a new order from the customer's cart."""
    # Normalize pickup -> takeaway
    order_type = raw_data.get("order_type", "dine_in")
    if order_type == "pickup":
        order_type = "takeaway"
    raw_data["order_type"] = order_type

    # Accept legacy PWA field names
    if "notes" in raw_data and "customer_notes" not in raw_data:
        raw_data["customer_notes"] = raw_data["notes"]
    if "table_id" in raw_data and "dining_table_id" not in raw_data:
        raw_data["dining_table_id"] = raw_data["table_id"]

    # Auto-discover cart_id from customer + store if not provided
    if "cart_id" not in raw_data:
        cart_result = await db.execute(
            select(CustomerCart).where(
                CustomerCart.customer_id == customer.id,
                CustomerCart.store_id == raw_data.get("store_id", 0),
            )
        )
        cart = cart_result.scalar_one_or_none()
        if cart:
            raw_data["cart_id"] = cart.id

    # Strip fields unknown to OrderCreate schema
    extra_keys = {
        "payment_method", "payment_method_id", "pickup_time", "delivery_address",
        "recipient_name", "recipient_phone", "delivery_instructions",
        "checkout_token", "reward_redemption_code", "item_id",
    }
    for k in extra_keys:
        raw_data.pop(k, None)

    data = OrderCreate(**raw_data)

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


@router.post("/{order_id}/cancel", response_model=APIResponse[dict])
async def cancel_order(
    customer: ActiveCustomer,
    db: DBDependency,
    order_id: int,
):
    """Customer-initiated order cancellation."""
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

    # Only allow cancelling pending/initiated orders
    if order.status not in ("pending", "initiated"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel order with status '{order.status}'")

    order.status = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)

    # Log status change
    log = OrderStatusLog(
        order_id=order.id,
        status="cancelled",
        changed_by=customer.id,
        changed_at=datetime.now(timezone.utc),
        notes="Cancelled by customer",
    )
    db.add(log)

    await db.commit()
    return APIResponse(data={"order_id": order.id, "status": "cancelled"})


@router.post("/{order_id}/reorder", response_model=APIResponse[dict])
async def reorder(
    customer: ActiveCustomer,
    db: DBDependency,
    order_id: int,
):
    """Rebuild cart from a previous order."""
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

    # Fetch order line items
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    line_items = li_result.scalars().all()

    if not line_items:
        raise HTTPException(status_code=400, detail="Order has no items to reorder")

    # Get or create customer's cart
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.customer_id == customer.id,
            CustomerCart.store_id == order.store_id,
        )
    )
    cart = cart_result.scalar_one_or_none()
    if not cart:
        cart = CustomerCart(customer_id=customer.id, store_id=order.store_id)
        db.add(cart)
        await db.commit()
        await db.refresh(cart)

    # Clear existing cart items for this store
    await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    # Actually delete them
    from sqlalchemy import delete
    await db.execute(delete(CartLineItem).where(CartLineItem.cart_id == cart.id))

    # Add order items to cart
    for li in line_items:
        cart_item = CartLineItem(
            cart_id=cart.id,
            menu_item_id=li.menu_item_id,
            quantity=li.quantity,
            unit_price=li.unit_price,
            special_instructions=li.special_instructions,
        )
        db.add(cart_item)

    await db.commit()

    return APIResponse(data={
        "cart_id": cart.id,
        "store_id": order.store_id,
        "items_added": len(line_items),
        "message": "Cart rebuilt from order",
    })


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
    
    # Batch-query payment methods for all orders
    order_ids = [o.id for o in orders]
    payment_map: dict[int, str | None] = {}
    if order_ids:
        pay_result = await db.execute(
            select(Payment.order_id, Payment.payment_method_type)
            .where(Payment.order_id.in_(order_ids))
        )
        for pid, pmt in pay_result.all():
            if pid not in payment_map:
                payment_map[pid] = pmt
    
    items = []
    for order in orders:
        order_out = _build_order_out(order, db)
        store_result = await db.execute(select(Store.store_name, Store.address_line_1).where(Store.id == order.store_id))
        store_row = store_result.first()
        order_out.store_name = store_row[0] if store_row else None
        order_out.store_address = store_row[1] if store_row else None
        order_out.payment_method = payment_map.get(order.id)
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

    # Add store info
    store_result = await db.execute(select(Store.store_name, Store.address_line_1).where(Store.id == order.store_id))
    store_row = store_result.first()
    order_out.store_name = store_row[0] if store_row else None
    order_out.store_address = store_row[1] if store_row else None
    
    # Fetch line items
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    line_items = []
    for li in li_result.scalars().all():
        li_out = OrderLineItemOut.model_validate(li)
        li_out.name = li.item_snapshot.get("item_name") if li.item_snapshot else None
        li_out.image_url = li.item_snapshot.get("image_url") if li.item_snapshot else None
        line_items.append(li_out)
    order_out.line_items = line_items
    
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
    
    # Fetch payment method from payments table
    payment_result = await db.execute(
        select(Payment.payment_method_type).where(
            Payment.order_id == order.id,
            Payment.status.in_(["captured", "authorized", "settled"]),
        ).order_by(Payment.created_at.desc()).limit(1)
    )
    payment_row = payment_result.first()
    order_out.payment_method = payment_row[0] if payment_row else None
    
    return APIResponse(data=order_out)
