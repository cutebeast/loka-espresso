"""Order service layer."""

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from decimal import Decimal

from app.models.cart import CartLineItem, CustomerCart
from app.models.inventory import InventoryItem, InventoryMovementLog
from app.models.menu import MenuItemRecipe
from app.models.order import Order, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.staff import TipAllocation
from app.models.store import Store, StoreConfiguration
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


async def _deduct_stock_for_order(
    db: AsyncSession,
    order: Order,
    line_items: list,
) -> None:
    """Deduct inventory stock based on menu item recipes for an order.

    `line_items` should be objects with `menu_item_id`, `menu_variant_id`, and `quantity` attributes.
    """
    from sqlalchemy import select

    recipe_needs: dict[int, Decimal] = {}
    for li in line_items:
        menu_variant_id = getattr(li, "menu_variant_id", None)
        recipe_result = await db.execute(
            select(MenuItemRecipe).where(
                MenuItemRecipe.menu_item_id == li.menu_item_id,
                MenuItemRecipe.menu_variant_id == menu_variant_id if menu_variant_id else MenuItemRecipe.menu_variant_id.is_(None),
            )
        )
        recipes = recipe_result.scalars().all()
        for rc in recipes:
            qty_needed = Decimal(str(rc.quantity_required)) * Decimal(li.quantity) * (Decimal(1) + Decimal(str(rc.waste_factor)))
            recipe_needs[rc.inventory_item_id] = recipe_needs.get(rc.inventory_item_id, Decimal(0)) + qty_needed

    if not recipe_needs:
        return

    inv_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id.in_(list(recipe_needs.keys())),
            InventoryItem.store_id == order.store_id,
        ).with_for_update()
    )
    inv_items = {inv.id: inv for inv in inv_result.scalars().all()}

    # Filter recipe needs to only those inventory items present in this store.
    # Recipes may be shared across stores with store-specific inventory mappings.
    recipe_needs = {inv_id: qty for inv_id, qty in recipe_needs.items() if inv_id in inv_items}
    if not recipe_needs:
        return

    for inv_id, qty_needed in recipe_needs.items():
        inv = inv_items[inv_id]
        current = Decimal(str(inv.current_stock))
        if current < qty_needed:
            raise OrderError(f"Insufficient stock for {inv.item_name}: need {float(qty_needed):.3f}, have {float(current):.3f}", 400)

    for inv_id, qty_needed in recipe_needs.items():
        inv = inv_items[inv_id]
        old_stock = Decimal(str(inv.current_stock))
        new_stock = old_stock - qty_needed
        inv.current_stock = new_stock
        db.add(InventoryMovementLog(
            store_id=order.store_id,
            inventory_item_id=inv_id,
            movement_type="out",
            quantity_delta=-float(qty_needed),
            stock_after=float(new_stock),
            reserved_delta=0,
            reserved_after=float(inv.reserved_stock),
            reason=f"Order {order.order_number} stock deduction",
            reference_type="order",
            reference_id=order.id,
            unit_cost_at_movement=float(inv.unit_cost) if inv.unit_cost else None,
            movement_cost=float(qty_needed * Decimal(str(inv.unit_cost or 0))),
        ))


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
    
    # Fetch store config for fees
    config_result = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == cart.store_id,
            StoreConfiguration.config_key.in_(["order.delivery_fee", "order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_result.scalars().all()}
    delivery_fee = float(config_map.get("order.delivery_fee", 0) or 0)
    service_charge = float(config_map.get("order.service_charge", 0) or 0)
    tax_rate = Decimal(str(config_map.get("order.tax_rate", 0) or 0))
    subtotal = float(cart.subtotal)
    tax_amount = float(round(cart.subtotal * tax_rate, 2))

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
        items_subtotal=subtotal,
        modifier_subtotal=sum(float(i.modifier_total) * i.quantity for i in cart_items),
        delivery_fee=delivery_fee if data.fulfillment_type == "delivery" else 0,
        service_charge=service_charge,
        tax_amount=tax_amount,
        discount_amount=0,
        voucher_discount=0,
        reward_discount=0,
        tip_amount=data.tip_amount or 0,
        total_amount=subtotal + (delivery_fee if data.fulfillment_type == "delivery" else 0) + service_charge + tax_amount + (data.tip_amount or 0),
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

    # Deduct recipe-based stock
    await _deduct_stock_for_order(db, order, cart_items)

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
    
    # Auto-create tip allocation if customer tipped
    if data.tip_amount and data.tip_amount > 0:
        tip = TipAllocation(
            order_id=order.id,
            staff_id=0,  # pooled tip, unassigned until distributed
            tip_amount=float(data.tip_amount),
            allocation_type="fixed",
        )
        db.add(tip)

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
    stmt = select(Order).options(
        selectinload(Order.line_items),
        selectinload(Order.store),
    ).where(
        Order.customer_id == customer_id,
        Order.deleted_at.is_(None),
    ).order_by(Order.created_at.desc())
    
    if status:
        stmt = stmt.where(Order.status == status)
    
    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count(Order.id)).where(
            Order.customer_id == customer_id,
            Order.deleted_at.is_(None),
        )
    )
    total = count_result.scalar() or 0
    
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    return orders, total
