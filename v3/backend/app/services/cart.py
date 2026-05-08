"""Cart service layer."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartLineItem, CustomerCart
from app.models.menu import MenuItem, MenuModifierOption, MenuVariant
from app.schemas.cart import CartLineItemCreate, CartLineItemUpdate


class CartError(Exception):
    """Cart-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def get_or_create_cart(
    db: AsyncSession,
    customer_id: int,
    store_id: int,
) -> CustomerCart:
    """Get existing cart or create new one for customer+store."""
    result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.customer_id == customer_id,
            CustomerCart.store_id == store_id,
        )
    )
    cart = result.scalar_one_or_none()
    if cart is None:
        cart = CustomerCart(
            customer_id=customer_id,
            store_id=store_id,
            item_count=0,
            subtotal=0.0,
        )
        db.add(cart)
        await db.flush()
    return cart


async def _get_menu_item_price(
    db: AsyncSession,
    menu_item_id: int,
    menu_variant_id: int | None,
    selected_modifiers: list[dict],
) -> tuple[float, float]:
    """Calculate unit price and modifier total for a line item."""
    item_result = await db.execute(
        select(MenuItem).where(MenuItem.id == menu_item_id)
    )
    item = item_result.scalar_one_or_none()
    if item is None:
        raise CartError("Menu item not found", 404)
    
    unit_price = float(item.base_price)
    
    # Add variant price adjustment
    if menu_variant_id:
        variant_result = await db.execute(
            select(MenuVariant).where(MenuVariant.id == menu_variant_id)
        )
        variant = variant_result.scalar_one_or_none()
        if variant:
            unit_price += float(variant.price_adjustment)
    
    # Calculate modifier total
    modifier_total = 0.0
    for mod in selected_modifiers:
        option_ids = mod.get("selected_option_ids", [])
        for opt_id in option_ids:
            opt_result = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id == opt_id)
            )
            opt = opt_result.scalar_one_or_none()
            if opt:
                modifier_total += float(opt.price_adjustment)
    
    return unit_price, modifier_total


async def add_line_item(
    db: AsyncSession,
    customer_id: int,
    store_id: int,
    data: CartLineItemCreate,
) -> CustomerCart:
    """Add a line item to the customer's cart."""
    cart = await get_or_create_cart(db, customer_id, store_id)
    
    unit_price, modifier_total = await _get_menu_item_price(
        db, data.menu_item_id, data.menu_variant_id, data.selected_modifiers
    )
    
    line_total = (unit_price + modifier_total) * data.quantity
    
    # Check if same item+variant already exists
    result = await db.execute(
        select(CartLineItem).where(
            CartLineItem.cart_id == cart.id,
            CartLineItem.menu_item_id == data.menu_item_id,
            CartLineItem.menu_variant_id == data.menu_variant_id,
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        existing.quantity += data.quantity
        existing.line_total = (existing.unit_price + existing.modifier_total) * existing.quantity
        if data.special_instructions:
            existing.special_instructions = data.special_instructions
    else:
        line_item = CartLineItem(
            cart_id=cart.id,
            menu_item_id=data.menu_item_id,
            menu_variant_id=data.menu_variant_id,
            quantity=data.quantity,
            unit_price=unit_price,
            line_total=line_total,
            selected_modifiers={m.modifier_group_id: m.selected_option_ids for m in data.selected_modifiers},
            modifier_total=modifier_total,
            special_instructions=data.special_instructions,
        )
        db.add(line_item)
    
    await db.flush()
    # Recalculate cart totals
    await _recalc_cart(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def update_line_item(
    db: AsyncSession,
    customer_id: int,
    line_item_id: int,
    data: CartLineItemUpdate,
) -> CustomerCart:
    """Update a line item in the cart."""
    result = await db.execute(
        select(CartLineItem).where(
            CartLineItem.id == line_item_id,
        )
    )
    line_item = result.scalar_one_or_none()
    if line_item is None:
        raise CartError("Line item not found", 404)
    
    cart_result = await db.execute(
        select(CustomerCart).where(CustomerCart.id == line_item.cart_id)
    )
    cart = cart_result.scalar_one()
    if cart.customer_id != customer_id:
        raise CartError("Not authorized", 403)
    
    if data.quantity is not None:
        line_item.quantity = data.quantity
    if data.selected_modifiers is not None:
        line_item.selected_modifiers = {m.modifier_group_id: m.selected_option_ids for m in data.selected_modifiers}
        # Recalculate modifier total
        _, modifier_total = await _get_menu_item_price(
            db, line_item.menu_item_id, line_item.menu_variant_id, data.selected_modifiers
        )
        line_item.modifier_total = modifier_total
    if data.special_instructions is not None:
        line_item.special_instructions = data.special_instructions
    
    line_item.line_total = (line_item.unit_price + line_item.modifier_total) * line_item.quantity
    
    await db.flush()
    await _recalc_cart(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def remove_line_item(
    db: AsyncSession,
    customer_id: int,
    line_item_id: int,
) -> CustomerCart:
    """Remove a line item from the cart."""
    result = await db.execute(
        select(CartLineItem).where(CartLineItem.id == line_item_id)
    )
    line_item = result.scalar_one_or_none()
    if line_item is None:
        raise CartError("Line item not found", 404)
    
    cart_result = await db.execute(
        select(CustomerCart).where(CustomerCart.id == line_item.cart_id)
    )
    cart = cart_result.scalar_one()
    if cart.customer_id != customer_id:
        raise CartError("Not authorized", 403)
    
    await db.delete(line_item)
    await db.flush()
    await _recalc_cart(db, cart)
    await db.commit()
    await db.refresh(cart)
    return cart


async def clear_cart(
    db: AsyncSession,
    customer_id: int,
    store_id: int,
) -> CustomerCart:
    """Clear all items from the cart."""
    result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.customer_id == customer_id,
            CustomerCart.store_id == store_id,
        )
    )
    cart = result.scalar_one_or_none()
    if cart is None:
        raise CartError("Cart not found", 404)
    
    for item in cart.line_items:
        await db.delete(item)
    
    cart.item_count = 0
    cart.subtotal = 0.0
    cart.last_activity_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cart)
    return cart


async def _recalc_cart(db: AsyncSession, cart: CustomerCart) -> None:
    """Recalculate cart totals."""
    result = await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    items = result.scalars().all()
    cart.item_count = sum(i.quantity for i in items)
    cart.subtotal = sum(float(i.line_total) for i in items)
    cart.last_activity_at = datetime.now(timezone.utc)
