"""Order service layer."""

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from decimal import Decimal

from app.models.cart import CartLineItem, CustomerCart
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.menu import MenuItemRecipe
from app.models.order import Order, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.staff import TipAllocation
from app.models.store import Store, StoreConfiguration
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.schemas.order import OrderCreate


class OrderError(Exception):
    """Order-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _build_order_out(order: Order):
    """Build OrderOut from Order model without lazy loading.
    Shared utility used by admin and customer order endpoints."""
    from app.schemas.order import OrderOut
    order_dict = {c: getattr(order, c) for c in order.__table__.columns.keys()}
    return OrderOut.model_validate(order_dict)


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
            if rc.quantity_required is None or li.quantity is None:
                continue
            qty_needed = Decimal(str(rc.quantity_required)) * Decimal(li.quantity) * (Decimal(1) + Decimal(str(rc.waste_factor or 0)))
            recipe_needs[rc.inventory_item_id] = recipe_needs.get(rc.inventory_item_id, Decimal(0)) + qty_needed

    if not recipe_needs:
        return

    inv_item_result = await db.execute(
        select(InventoryItem).where(InventoryItem.id.in_(list(recipe_needs.keys())))
    )
    inv_items = {inv.id: inv for inv in inv_item_result.scalars().all()}

    recipe_needs = {inv_id: qty for inv_id, qty in recipe_needs.items() if inv_id in inv_items}
    if not recipe_needs:
        return

    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id.in_(list(recipe_needs.keys())),
            InventoryStock.store_id == order.store_id,
        ).with_for_update()
    )
    stock_map = {s.inventory_item_id: s for s in stock_result.scalars().all()}

    for inv_id in recipe_needs:
        if inv_id not in stock_map:
            stock = InventoryStock(
                inventory_item_id=inv_id,
                store_id=order.store_id,
                current_stock=0,
                reserved_stock=0,
            )
            db.add(stock)
            stock_map[inv_id] = stock

    for inv_id, qty_needed in recipe_needs.items():
        stock = stock_map[inv_id]
        current = Decimal(str(stock.current_stock))
        if current < qty_needed:
            inv = inv_items[inv_id]
            raise OrderError(f"Insufficient stock for {inv.item_name}: need {float(qty_needed):.3f}, have {float(current):.3f}", 400)

    for inv_id, qty_needed in recipe_needs.items():
        stock = stock_map[inv_id]
        inv = inv_items[inv_id]
        old_stock = Decimal(str(stock.current_stock))
        new_stock = old_stock - qty_needed
        stock.current_stock = new_stock
        db.add(InventoryMovementLog(
            store_id=order.store_id,
            inventory_item_id=inv_id,
            movement_type="out",
            quantity_delta=-Decimal(str(qty_needed)),
            stock_after=Decimal(str(new_stock)),
            reserved_delta=0,
            reserved_after=float(stock.reserved_stock),
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
    # Fetch cart with row lock to prevent duplicate orders
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.id == data.cart_id,
            CustomerCart.customer_id == customer_id,
        ).with_for_update()
    )
    cart = cart_result.scalar_one_or_none()
    if cart is None:
        raise OrderError("Cart not found", 404)
    
    if cart.item_count == 0:
        raise OrderError("Cart is empty", 400)
    
    # Fetch store with active check
    store_result = await db.execute(
        select(Store).where(Store.id == cart.store_id, Store.is_active.is_(True), Store.deleted_at.is_(None))
    )
    store = store_result.scalar_one_or_none()
    if store is None:
        raise OrderError("Store is not active or does not exist", 400)
    
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
    config_map = {c.config_key: Decimal(str(c.config_value or 0)) for c in config_result.scalars().all()}
    delivery_fee = config_map.get("order.delivery_fee", Decimal(0))
    service_charge = config_map.get("order.service_charge", Decimal(0))
    tax_rate = config_map.get("order.tax_rate", Decimal(0))
    subtotal = Decimal(str(cart.subtotal))
    tax_amount = round(subtotal * tax_rate, 2)

    modifier_sub = sum(Decimal(str(i.modifier_total)) * i.quantity for i in cart_items)
    is_delivery = data.fulfillment_type in ("standard_delivery", "express_delivery", "third_party_delivery")
    tip = Decimal(str(data.tip_amount or 0))
    total = subtotal + modifier_sub + (delivery_fee if is_delivery else Decimal(0)) + service_charge + tax_amount + tip

    # ── Voucher / Reward discount processing ──
    voucher_discount = Decimal(0)
    reward_discount = Decimal(0)
    voucher_used: CustomerVoucher | None = None
    reward_used: CustomerReward | None = None

    if data.voucher_code:
        voucher_result = await db.execute(
            select(CustomerVoucher).where(
                CustomerVoucher.voucher_code == data.voucher_code,
                CustomerVoucher.customer_id == customer_id,
            ).with_for_update()
        )
        cv = voucher_result.scalar_one_or_none()
        if cv is None:
            raise OrderError(f"Voucher not found: {data.voucher_code}", 400)
        if cv.status != "active":
            raise OrderError(f"Voucher is {cv.status}", 400)
        if cv.expires_at and cv.expires_at < datetime.now(timezone.utc):
            raise OrderError("Voucher has expired", 400)
        
        vd_result = await db.execute(
            select(VoucherDefinition).where(VoucherDefinition.id == cv.voucher_definition_id)
        )
        vd = vd_result.scalar_one_or_none()
        if vd is None or not vd.is_active:
            raise OrderError("Voucher definition is no longer active", 400)
        if vd.valid_from and vd.valid_from > datetime.now(timezone.utc):
            raise OrderError("Voucher is not yet valid", 400)
        if vd.valid_until and vd.valid_until < datetime.now(timezone.utc):
            raise OrderError("Voucher has expired", 400)

        order_base = subtotal + modifier_sub  # voucher minimum order value checked against food+modifiers
        min_order = Decimal(str(vd.minimum_order_value or 0))
        if order_base < min_order:
            raise OrderError(f"Voucher requires minimum order of {float(min_order):.2f}", 400)

        if vd.voucher_type == "percentage_off":
            pct = Decimal(str(vd.discount_value)) / Decimal(100)
            voucher_discount = round(order_base * pct, 2)
            if vd.discount_max_amount is not None:
                voucher_discount = min(voucher_discount, Decimal(str(vd.discount_max_amount)))
        elif vd.voucher_type == "fixed_amount_off":
            voucher_discount = Decimal(str(vd.discount_value))
        elif vd.voucher_type == "free_delivery":
            voucher_discount = delivery_fee if is_delivery else Decimal(0)
        # free_item and other types not implemented for self-checkout

        cv.status = "used"
        cv.order_id = None  # set after order flush
        cv.used_at = datetime.now(timezone.utc)
        cv.use_count = (cv.use_count or 0) + 1
        vd.global_use_count = (vd.global_use_count or 0) + 1
        voucher_used = cv

    if data.reward_id:
        reward_result = await db.execute(
            select(CustomerReward).where(
                CustomerReward.id == data.reward_id,
                CustomerReward.customer_id == customer_id,
            ).with_for_update()
        )
        cr = reward_result.scalar_one_or_none()
        if cr is None:
            raise OrderError(f"Reward not found for this customer: id={data.reward_id}", 400)
        if cr.status != "active":
            raise OrderError(f"Reward is {cr.status}", 400)
        if cr.expires_at and cr.expires_at < datetime.now(timezone.utc):
            raise OrderError("Reward has expired", 400)

        rc_result = await db.execute(
            select(RewardCatalog).where(RewardCatalog.id == cr.reward_catalog_id)
        )
        rc = rc_result.scalar_one_or_none()
        if rc is None or not rc.is_active:
            raise OrderError("Reward catalog is no longer active", 400)

        order_base = subtotal + modifier_sub
        min_order = Decimal(str(rc.minimum_order_value or 0))
        if order_base < min_order:
            raise OrderError(f"Reward requires minimum order of {float(min_order):.2f}", 400)

        if rc.reward_type == "percentage_discount":
            pct = Decimal(str(rc.discount_value or 0)) / Decimal(100)
            reward_discount = round(order_base * pct, 2)
            if rc.discount_max_amount is not None:
                reward_discount = min(reward_discount, Decimal(str(rc.discount_max_amount)))
        elif rc.reward_type == "fixed_discount":
            reward_discount = Decimal(str(rc.discount_value or 0))
        elif rc.reward_type == "free_delivery":
            reward_discount = delivery_fee if is_delivery else Decimal(0)

        cr.status = "used"
        cr.order_id = None  # set after order flush
        cr.used_at = datetime.now(timezone.utc)
        rc.total_redemptions = (rc.total_redemptions or 0) + 1
        reward_used = cr

    total_discount = voucher_discount + reward_discount
    total -= total_discount
    loyalty_points_earned = 0  # recalculated after discount
    if not voucher_used and not reward_used:
        loyalty_points_earned = 0  # points from order subtotal (simplified)

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
        items_subtotal=float(subtotal),
        modifier_subtotal=float(modifier_sub),
        delivery_fee=float(delivery_fee) if is_delivery else 0,
        service_charge=float(service_charge),
        tax_amount=float(tax_amount),
        discount_amount=float(total_discount),
        voucher_discount=float(voucher_discount),
        reward_discount=float(reward_discount),
        tip_amount=float(tip),
        total_amount=float(total),
        total_amount_currency=store.currency_code,
        loyalty_points_earned=loyalty_points_earned,
        loyalty_points_redeemed=0,
        customer_notes=data.customer_notes,
    )
    db.add(order)
    await db.flush()

    # Link used voucher/reward to this order
    if voucher_used:
        voucher_used.order_id = order.id
    if reward_used:
        reward_used.order_id = order.id
    
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
    reason_parts = ["Order created"]
    if voucher_used:
        reason_parts.append(f"voucher {data.voucher_code} applied ({float(voucher_discount):.2f})")
    if reward_used:
        reason_parts.append(f"reward #{data.reward_id} applied ({float(reward_discount):.2f})")
    status_log = OrderStatusLog(
        order_id=order.id,
        from_status=None,
        to_status="pending",
        reason="; ".join(reason_parts),
        actor_type="system",
    )
    db.add(status_log)
    
    # Create fulfillment record for delivery/pickup
    if data.fulfillment_type in ("standard_delivery", "express_delivery", "third_party_delivery", "counter_pickup", "curbside_pickup"):
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
            staff_id=None,  # pooled tip, unassigned until distributed
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
    store_id: int | None = None,
    page: int = 1,
    per_page: int = 20,
):
    """List orders for a customer."""
    from sqlalchemy import func

    base_filters = [
        Order.customer_id == customer_id,
        Order.deleted_at.is_(None),
    ]
    if store_id is not None:
        base_filters.append(Order.store_id == store_id)
    if status:
        base_filters.append(Order.status == status)

    stmt = select(Order).options(
        selectinload(Order.line_items),
        selectinload(Order.store),
    ).where(*base_filters).order_by(Order.created_at.desc())

    count_stmt = select(func.count(Order.id)).where(*base_filters)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    return orders, total
