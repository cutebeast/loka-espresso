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
from app.schemas.base import APIResponse, PaginatedResponse, BaseSchema
from app.schemas.order import (
    OrderAdjustmentOut,
    OrderCreate,
    OrderFulfillmentOut,
    OrderLineItemOut,
    OrderListParams,
    OrderOut,
    OrderStatusLogOut,
)
from app.services.order import OrderError, auto_cancel_order, create_order_from_cart, get_customer_orders, reverse_order_effects, _build_order_out
from app.services.payment import cancel_pending_order_payments


class CustomerOrderCreateRequest(BaseSchema):
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

    # Map order_type to fulfillment_type so delivery/pickup metadata is honored.
    fulfillment_map = {
        "dine_in": "dine_in_service",
        "takeaway": "counter_pickup",
        "delivery": "standard_delivery",
        "drive_thru": "counter_pickup",
    }
    if not raw_dict.get("fulfillment_type"):
        raw_dict["fulfillment_type"] = fulfillment_map.get(order_type, "counter_pickup")

    # Accept legacy PWA field names
    if raw_dict.get("notes") and "customer_notes" not in raw_dict:
        raw_dict["customer_notes"] = raw_dict["notes"]
    if raw_dict.get("table_id") and "dining_table_id" not in raw_dict:
        raw_dict["dining_table_id"] = raw_dict["table_id"]
    if raw_dict.get("delivery_address") and isinstance(raw_dict["delivery_address"], str):
        raw_dict["delivery_address"] = {"address": raw_dict["delivery_address"]}

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
        "payment_method", "payment_method_id",
        "checkout_token", "reward_redemption_code", "item_id",
        "notes", "table_id",
    }
    for k in extra_keys:
        raw_dict.pop(k, None)

    data = OrderCreate(**raw_dict)

    try:
        # ── Auto-cancel stale unpaid orders (>2 hours) ──
        from datetime import timedelta as _timedelta
        stale_threshold = datetime.now(timezone.utc) - _timedelta(hours=2)
        stale_query = (
            select(Order)
            .where(
                Order.customer_id == customer.id,
                Order.payment_status == "initiated",
                Order.status == "pending",
                # Open tabs (pay after meal) are never auto-cancelled
                Order.payment_flow == "prepaid",
                Order.created_at < stale_threshold,
            )
        )
        stale_orders = (await db.execute(stale_query)).scalars().all()
        for stale in stale_orders:
            await auto_cancel_order(db, stale, "Auto-cancelled — unpaid for >2 hours")
        if stale_orders:
            await db.commit()

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
    from app.services.order import compute_estimated_ready_at
    order_out.estimated_ready_at = await compute_estimated_ready_at(db, order, line_items)
    
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

    # Customers may only cancel unpaid, still-pending orders themselves.
    # Paid orders must go through the store so a refund can be issued.
    if order.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot cancel order with status '{order.status}'")
    if order.payment_status in ("authorized", "captured", "settled"):
        raise HTTPException(
            status_code=400,
            detail="This order has already been paid. Please contact the store to cancel and receive a refund.",
        )

    await db.execute(text("SET LOCAL app.current_actor_type = 'customer'"))
    order.status = "cancelled_by_customer"
    order.cancelled_at = datetime.now(timezone.utc)
    await db.flush()
    await reverse_order_effects(db, order)
    cancelled_payment_ids = await cancel_pending_order_payments(db, order.id)
    await db.commit()
    return APIResponse(data={
        "order_id": order.id,
        "status": "cancelled_by_customer",
        "cancelled_payment_ids": cancelled_payment_ids,
    })


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
        unit_price = li.unit_price
        modifier_total = li.modifier_total or 0
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

    # Honest pickup estimate for the ETA card (computed — the queue moves)
    from app.services.order import compute_estimated_ready_at
    order_out.estimated_ready_at = await compute_estimated_ready_at(db, order, order.line_items)

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


@router.get("/{order_id}/einvoice", response_model=APIResponse[dict | None])
async def get_order_einvoice(
    order_id: int,
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Get the e-invoice document for a customer's paid order (null if none)."""
    from app.models.einvoice import EinvoiceDocument

    order_query = select(Order).where(
        Order.id == order_id,
        Order.customer_id == customer.id,
    )
    result = await db.execute(order_query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    result = await db.execute(
        select(EinvoiceDocument)
        .where(EinvoiceDocument.order_id == order.id)
        .order_by(EinvoiceDocument.id.desc())
        .limit(1)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        return APIResponse(data=None)

    return APIResponse(data={
        "id": doc.id,
        "code_number": doc.code_number,
        "status": doc.status,
        "document_type": doc.document_type,
        "validation_link": doc.validation_link,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "order_number": order.order_number,
    })


@router.post("/{order_id}/einvoice", response_model=APIResponse[dict])
async def request_order_einvoice(
    order_id: int,
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Request e-invoice generation for a paid order. Idempotent — returns existing if already issued."""
    from app.models.einvoice import EinvoiceDocument
    from app.services.einvoice import issue_einvoice

    order_query = select(Order).where(
        Order.id == order_id,
        Order.customer_id == customer.id,
    )
    result = await db.execute(order_query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Must be paid
    if order.payment_status not in ("captured", "settled", "paid", "partially_refunded"):
        raise HTTPException(
            status_code=400,
            detail="E-invoice can only be issued for paid orders"
        )

    # Check existing
    result = await db.execute(
        select(EinvoiceDocument)
        .where(EinvoiceDocument.order_id == order.id)
        .order_by(EinvoiceDocument.id.desc())
        .limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return APIResponse(data={
            "id": existing.id,
            "code_number": existing.code_number,
            "status": existing.status,
            "document_type": existing.document_type,
            "validation_link": existing.validation_link,
            "created_at": existing.created_at.isoformat() if existing.created_at else None,
            "order_number": order.order_number,
            "already_issued": True,
        })

    # Find the captured payment
    payment_result = await db.execute(
        select(Payment).where(
            Payment.order_id == order.id,
            Payment.status.in_(["captured", "partially_refunded"]),
        ).order_by(Payment.created_at.desc()).limit(1)
    )
    payment = payment_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(
            status_code=400,
            detail="No captured payment found for this order"
        )

    try:
        doc = await issue_einvoice(db, order, payment, document_type="01")
    except Exception as e:
        logger.exception("E-invoice issue failed for order %s", order.id)
        raise HTTPException(status_code=500, detail="E-invoice could not be generated at this time")

    return APIResponse(data={
        "id": doc.id,
        "code_number": doc.code_number,
        "status": doc.status,
        "document_type": doc.document_type,
        "validation_link": doc.validation_link,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "order_number": order.order_number,
        "already_issued": False,
    })
