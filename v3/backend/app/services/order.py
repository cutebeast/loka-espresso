"""Order service layer."""

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartLineItem, CustomerCart
from app.models.order import Order, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.store import Store
from app.schemas.order import OrderCreate


class OrderError(Exception):
    """Order-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def generate_order_number() -> str:
    """Generate a unique order number."""
    now = datetime.now(timezone.utc)
    return f"ORD-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


async def create_order_from_cart(
    db: AsyncSession,
    customer_id: int,
    data: OrderCreate,
) -> Order:
    """Create an order from a customer's cart."""
    # Fetch cart
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.id == data.cart_id,
            CustomerCart.customer_id == customer_id,
        )
    )
    cart = cart_result.scalar_one_or_none()
    if cart is None:
        raise OrderError("Cart not found", 404)
    
    if cart.item_count == 0:
        raise OrderError("Cart is empty", 400)
    
    # Fetch store for currency
    store_result = await db.execute(select(Store).where(Store.id == cart.store_id))
    store = store_result.scalar_one()
    
    # Fetch line items
    items_result = await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    cart_items = items_result.scalars().all()
    
    # Create order
    order = Order(
        customer_id=customer_id,
        store_id=cart.store_id,
        dining_table_id=data.dining_table_id,
        order_number=generate_order_number(),
        order_type=data.order_type,
        fulfillment_type=data.fulfillment_type,
        order_channel="mobile_app",
        status="pending",
        payment_status="initiated",
        item_count=cart.item_count,
        items_subtotal=cart.subtotal,
        modifier_subtotal=sum(float(i.modifier_total) * i.quantity for i in cart_items),
        delivery_fee=store.base_delivery_fee if data.fulfillment_type == "delivery" else 0,
        service_charge=0,  # TODO: calculate from store config
        tax_amount=0,  # TODO: calculate from store config
        discount_amount=0,
        voucher_discount=0,
        reward_discount=0,
        tip_amount=data.tip_amount or 0,
        total_amount=cart.subtotal + (store.base_delivery_fee if data.fulfillment_type == "delivery" else 0) + (data.tip_amount or 0),
        total_amount_currency=store.currency_code,
        loyalty_points_earned=0,
        loyalty_points_redeemed=0,
        customer_notes=data.customer_notes,
    )
    db.add(order)
    await db.flush()
    
    # Create order line items
    for ci in cart_items:
        oli = OrderLineItem(
            order_id=order.id,
            menu_item_id=ci.menu_item_id,
            menu_variant_id=ci.menu_variant_id,
            item_snapshot={},  # TODO: snapshot menu item details
            quantity=ci.quantity,
            unit_price=ci.unit_price,
            modifier_total=ci.modifier_total,
            line_total=ci.line_total,
            selected_modifiers=ci.selected_modifiers,
            special_instructions=ci.special_instructions,
        )
        db.add(oli)
    
    # Create initial status log
    status_log = OrderStatusLog(
        order_id=order.id,
        from_status=None,
        to_status="pending",
        reason="Order created",
        actor_type="system",
    )
    db.add(status_log)
    
    # Create fulfillment record for delivery/pickup
    if data.fulfillment_type in ("delivery", "pickup"):
        fulfillment = OrderFulfillment(
            order_id=order.id,
            status="pending_assignment",
            delivery_fee_snapshot=float(order.delivery_fee),
        )
        db.add(fulfillment)
    
    # Clear the cart
    for ci in cart_items:
        await db.delete(ci)
    cart.item_count = 0
    cart.subtotal = 0.0
    
    await db.commit()
    await db.refresh(order)
    return order


async def get_customer_orders(
    db: AsyncSession,
    customer_id: int,
    status: str | None = None,
    page: int = 1,
    per_page: int = 20,
):
    """List orders for a customer."""
    stmt = select(Order).where(
        Order.customer_id == customer_id,
        Order.deleted_at.is_(None),
    ).order_by(Order.created_at.desc())
    
    if status:
        stmt = stmt.where(Order.status == status)
    
    count_result = await db.execute(
        select(Order.id).where(
            Order.customer_id == customer_id,
            Order.deleted_at.is_(None),
        )
    )
    total = len(count_result.scalars().all())
    
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    return orders, total
