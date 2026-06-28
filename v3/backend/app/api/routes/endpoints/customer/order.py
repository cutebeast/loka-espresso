"""Customer order endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from app.api.routes.deps import ActiveCustomer, DBDependency
from app.models.cart import CustomerCart, CartLineItem
from app.models.menu import MenuItem
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
from app.services.order import OrderError, create_order_from_cart, get_customer_orders, _build_order_out


class CustomerOrderCreateRequest(BaseModel):
    """Flexible order create schema that accepts legacy PWA fields for backward compatibility."""
    model_config = ConfigDict(extra="allow")
    order_type: str = "dine_in"
    store_id: int = 0
    cart_id: int | None = None
    dining_table_id: int | None = None
    fulfillment_type: str | None = None
    customer_notes: str | None = None
    tip_amount: float | None = None
    table_id: int | None = None
    notes: str | None = None
    idempotency_key: str | None = None

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=APIResponse[OrderOut], status_code=status.HTTP_201_CREATED)
async def create_order(
    request: Request,
    customer: ActiveCustomer,
    db: DBDependency,
    raw_data: CustomerOrderCreateRequest,
):
    """Create a new order from the customer's cart."""
    raw_dict = raw_data.model_dump(exclude_unset=False)

    # Normalize pickup -> takeaway
    order_type = raw_dict.get("order_type", "dine_in")
    if order_type == "pickup":
        order_type = "takeaway"
    raw_dict["order_type"] = order_type

    # Accept legacy PWA field names
    if raw_dict.get("notes") and "customer_notes" not in raw_dict:
        raw_dict["customer_notes"] = raw_dict["notes"]
    if raw_dict.get("table_id") and "dining_table_id" not in raw_dict:
        raw_dict["dining_table_id"] = raw_dict["table_id"]

    # Validate store_id is present and valid
    store_id = raw_dict.get("store_id")
    if not store_id or store_id <= 0:
        raise HTTPException(status_code=422, detail="store_id is required and must be a positive integer")

    # Auto-discover cart_id from customer + store if not provided
    if not raw_dict.get("cart_id"):
        cart_result = await db.execute(
            select(CustomerCart).where(
                CustomerCart.customer_id == customer.id,
                CustomerCart.store_id == store_id,
            )
        )
        cart = cart_result.scalar_one_or_none()
        if cart:
            raw_dict["cart_id"] = cart.id

    # Idempotency key may be supplied in the request body or via the Idempotency-Key header
    idempotency_key = raw_dict.get("idempotency_key") or request.headers.get("Idempotency-Key")
    if idempotency_key:
        raw_dict["idempotency_key"] = idempotency_key.strip()[:255]

    # Strip fields unknown to OrderCreate schema
    extra_keys = {
        "payment_method", "payment_method_id", "pickup_time", "delivery_address",
        "recipient_name", "recipient_phone", "delivery_instructions",
        "checkout_token", "reward_redemption_code", "item_id",
        "notes", "table_id",
    }
    for k in extra_keys:
        raw_dict.pop(k, None)

    data = OrderCreate(**raw_dict)

    try:
        order = await create_order_from_cart(db, customer.id, data)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    
    # Fetch line items
    result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    line_items = result.scalars().all()
    
    order_out = _build_order_out(order)
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
        select(Order)
        .where(
            Order.id == order_id,
            Order.customer_id == customer.id,
            Order.deleted_at.is_(None),
        )
        .with_for_update()
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # Only allow cancelling pending/initiated orders
    if order.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel order with status '{order.status}'")

    await db.execute(text("SET LOCAL app.current_actor_type = 'customer'"))
    order.status = "cancelled_by_customer"
    order.cancelled_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"order_id": order.id, "status": "cancelled_by_customer"})


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
        cart = CustomerCart(customer_id=customer.id, store_id=order.store_id, item_count=0, subtotal=0.0)
        db.add(cart)
        await db.commit()
        await db.refresh(cart)

    # Delete existing cart items for this store
    from sqlalchemy import delete
    await db.execute(delete(CartLineItem).where(CartLineItem.cart_id == cart.id))

    # Check menu item availability
    menu_item_ids = [li.menu_item_id for li in line_items]
    mi_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(menu_item_ids),
            MenuItem.is_available.is_(True),
            MenuItem.deleted_at.is_(None),
        )
    )
    available_ids = {mi.id for mi in mi_result.scalars().all()}

    # Add order items to cart (only available)
    added = 0
    for li in line_items:
        if li.menu_item_id not in available_ids:
            continue
        unit_price = float(li.unit_price)
        modifier_total = float(li.modifier_total or 0)
        qty = li.quantity
        line_total = (unit_price + modifier_total) * qty
        cart_item = CartLineItem(
            cart_id=cart.id,
            menu_item_id=li.menu_item_id,
            menu_variant_id=li.menu_variant_id,
            quantity=qty,
            unit_price=unit_price,
            line_total=line_total,
            selected_modifiers=li.selected_modifiers or {},
            modifier_total=modifier_total,
            special_instructions=li.special_instructions,
        )
        db.add(cart_item)
        added += 1

    await db.flush()
    # Recalculate cart totals
    from app.services.cart import _recalc_cart as recalc
    await recalc(db, cart)
    await db.commit()

    return APIResponse(data={
        "cart_id": cart.id,
        "store_id": order.store_id,
        "items_added": added,
        "message": f"Cart rebuilt from order ({added} of {len(line_items)} items available)",
    })


@router.get("", response_model=APIResponse[PaginatedResponse[OrderOut]])
async def list_orders(
    customer: ActiveCustomer,
    db: DBDependency,
    status: str | None = Query(None),
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List customer's orders."""
    orders, total = await get_customer_orders(
        db, customer.id, status=status, store_id=store_id, page=page, per_page=per_page
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
        order_out = _build_order_out(order)
        order_out.store_name = order.store.store_name if order.store else None
        order_out.store_address = order.store.address_line_1 if order.store else None
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
        select(Order)
        .options(
            selectinload(Order.line_items),
            selectinload(Order.status_logs),
            selectinload(Order.adjustments),
            selectinload(Order.fulfillment),
            selectinload(Order.store),
        )
        .where(
            Order.id == order_id,
            Order.customer_id == customer.id,
            Order.deleted_at.is_(None),
        )
    )
    order = result.unique().scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order_out = _build_order_out(order)

    # Add store info
    order_out.store_name = order.store.store_name if order.store else None
    order_out.store_address = order.store.address_line_1 if order.store else None

    # Build line items from eager-loaded relationship
    line_items = []
    for li in order.line_items:
        li_out = OrderLineItemOut.model_validate(li)
        li_out.name = li.item_snapshot.get("item_name") if li.item_snapshot else None
        li_out.image_url = li.item_snapshot.get("image_url") if li.item_snapshot else None
        line_items.append(li_out)
    order_out.line_items = line_items

    # Build status logs from eager-loaded relationship
    order_out.status_log = [OrderStatusLogOut.model_validate(i) for i in order.status_logs]

    # Build adjustments from eager-loaded relationship
    order_out.adjustments = [OrderAdjustmentOut.model_validate(i) for i in order.adjustments]

    # Build fulfillment from eager-loaded relationship
    if order.fulfillment:
        order_out.fulfillment = OrderFulfillmentOut.model_validate(order.fulfillment)
    
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
