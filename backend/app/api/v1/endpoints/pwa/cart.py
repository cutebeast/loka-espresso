from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.utils import to_float
from app.models.user import User
from app.models.order import CartItem
from app.models.menu import MenuItem
from app.models.marketing import CustomizationOption
from app.models.store import Store
from app.schemas.cart import CartItemCreate, CartItemUpdate, CartItemOut, CartOut

router = APIRouter(prefix="/cart", tags=["Cart"])


async def _validate_customization_options(
    option_ids: list[int], menu_item_id: int, db: AsyncSession
) -> list[dict]:
    """Validate customization_option_ids against the DB and return structured data.
    Returns list of {"id": int, "name": str, "price_adjustment": float}.
    """
    result = await db.execute(
        select(CustomizationOption).where(
            CustomizationOption.id.in_(option_ids),
            CustomizationOption.menu_item_id == menu_item_id,
            CustomizationOption.is_active == True,
        )
    )
    found = result.scalars().all()
    found_ids = {c.id for c in found}
    for oid in option_ids:
        if oid not in found_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Customization option {oid} not found or not available for this item",
            )
    return [
        {"id": c.id, "name": c.name, "price_adjustment": to_float(c.price_adjustment)}
        for c in found
    ]


@router.get("", response_model=CartOut)
async def get_cart(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    items = result.scalars().all()
    if not items:
        return CartOut(store_id=0, items=[], subtotal=0)
    store_id = items[0].store_id
    store_name = None
    sr = await db.execute(select(Store).where(Store.id == store_id))
    s = sr.scalar_one_or_none()
    if s:
        store_name = s.name
    subtotal = 0.0
    cart_items = []
    for ci in items:
        ir = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
        mi = ir.scalar_one_or_none()
        name = mi.name if mi else "Unknown"
        # Include customization price adjustments in subtotal
        base = to_float(ci.unit_price)
        custom_total = 0.0
        if ci.customizations and isinstance(ci.customizations, dict):
            for opt in ci.customizations.get("options", []):
                custom_total += opt.get("price_adjustment", 0)
        subtotal += (base + custom_total) * ci.quantity
        cart_items.append(CartItemOut(
            id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
            item_id=ci.item_id, quantity=ci.quantity,
            customizations=ci.customizations,
            customization_option_ids=ci.customization_option_ids,
            unit_price=to_float(ci.unit_price),
            item_name=name, created_at=ci.created_at,
        ))
    return CartOut(store_id=store_id, store_name=store_name, items=cart_items, subtotal=round(subtotal, 2))


@router.post("/items", response_model=CartItemOut, status_code=201)
async def add_to_cart(req: CartItemCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    existing_items = existing.scalars().all()
    if existing_items and existing_items[0].store_id != req.store_id:
        raise HTTPException(
            status_code=400,
            detail="Cart contains items from a different store. Clear your cart first before adding items from this store.",
        )

    item_result = await db.execute(select(MenuItem).where(MenuItem.id == req.item_id))
    menu_item = item_result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    # Validate and resolve customization_option_ids
    option_ids = req.customization_option_ids
    resolved_customizations = req.customizations
    if option_ids:
        resolved_customizations = {"options": await _validate_customization_options(option_ids, req.item_id, db)}

    dupe = await db.execute(
        select(CartItem).where(
            CartItem.user_id == user.id,
            CartItem.item_id == req.item_id,
            CartItem.store_id == req.store_id,
        )
    )
    existing_cart = dupe.scalar_one_or_none()
    if existing_cart:
        existing_cart.quantity += req.quantity
        if resolved_customizations:
            existing_cart.customizations = resolved_customizations
        if option_ids:
            existing_cart.customization_option_ids = option_ids
        await db.flush()
        return CartItemOut(
            id=existing_cart.id, user_id=user.id, store_id=existing_cart.store_id,
            item_id=existing_cart.item_id, quantity=existing_cart.quantity,
            customizations=existing_cart.customizations,
            customization_option_ids=existing_cart.customization_option_ids,
            unit_price=to_float(existing_cart.unit_price),
            item_name=menu_item.name, created_at=existing_cart.created_at,
        )

    ci = CartItem(
        user_id=user.id, store_id=req.store_id, item_id=req.item_id,
        quantity=req.quantity, customizations=resolved_customizations,
        customization_option_ids=option_ids,
        unit_price=menu_item.base_price,
    )
    db.add(ci)
    await db.flush()
    return CartItemOut(
        id=ci.id, user_id=user.id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=ci.customizations,
        customization_option_ids=ci.customization_option_ids,
        unit_price=to_float(ci.unit_price),
        item_name=menu_item.name, created_at=ci.created_at,
    )


@router.put("/items/{item_id}", response_model=CartItemOut)
async def update_cart_item(item_id: int, req: CartItemUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartItem).where(CartItem.id == item_id, CartItem.user_id == user.id))
    ci = result.scalar_one_or_none()
    if not ci:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if req.quantity is not None:
        ci.quantity = req.quantity
    if req.customization_option_ids is not None:
        option_ids = req.customization_option_ids
        if option_ids:
            resolved = await _validate_customization_options(option_ids, ci.item_id, db)
            ci.customizations = {"options": resolved}
        else:
            ci.customizations = None
        ci.customization_option_ids = option_ids
    elif req.customizations is not None:
        ci.customizations = req.customizations
    await db.flush()
    item_result = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
    menu_item = item_result.scalar_one_or_none()
    return CartItemOut(
        id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=ci.customizations,
        customization_option_ids=ci.customization_option_ids,
        unit_price=to_float(ci.unit_price),
        item_name=menu_item.name if menu_item else "Unknown", created_at=ci.created_at,
    )


@router.delete("/items/{item_id}")
async def remove_cart_item(item_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartItem).where(CartItem.id == item_id, CartItem.user_id == user.id))
    ci = result.scalar_one_or_none()
    if not ci:
        raise HTTPException(status_code=404, detail="Cart item not found")
    await db.delete(ci)
    await db.flush()
    return {"message": "Item removed"}


@router.delete("")
async def clear_cart(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    for ci in result.scalars().all():
        await db.delete(ci)
    await db.flush()
    return {"message": "Cart cleared"}
