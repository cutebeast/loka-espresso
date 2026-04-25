import hashlib
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


def _hash_option_ids(option_ids: list[int] | None) -> str | None:
    """Deterministic hash of sorted customization option IDs."""
    if not option_ids:
        return None
    sorted_ids = sorted(int(o) for o in option_ids)
    return hashlib.sha256(",".join(str(i) for i in sorted_ids).encode()).hexdigest()


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
    item_ids = [ci.item_id for ci in items]
    if item_ids:
        menu_items_result = await db.execute(
            select(MenuItem.id, MenuItem.name).where(MenuItem.id.in_(item_ids))
        )
        menu_item_map = {mi.id: mi.name for mi in menu_items_result.all()}
    else:
        menu_item_map = {}

    all_option_ids = []
    for ci in items:
        if ci.customization_option_ids:
            all_option_ids.extend(ci.customization_option_ids)

    custom_options_map = {}
    if all_option_ids:
        opts_result = await db.execute(
            select(CustomizationOption).where(CustomizationOption.id.in_(all_option_ids))
        )
        for opt in opts_result.scalars().all():
            custom_options_map[opt.id] = {"id": opt.id, "name": opt.name, "price_adjustment": to_float(opt.price_adjustment)}

    subtotal = 0.0
    cart_items = []
    for ci in items:
        name = menu_item_map.get(ci.item_id, "Unknown")
        base = to_float(ci.unit_price)
        resolved_customizations = None
        custom_total = 0.0
        if ci.customization_option_ids:
            resolved_options = [custom_options_map[oid] for oid in ci.customization_option_ids if oid in custom_options_map]
            for opt in resolved_options:
                custom_total += opt.get("price_adjustment", 0)
            resolved_customizations = {"options": resolved_options}
        subtotal += (base + custom_total) * ci.quantity
        cart_items.append(CartItemOut(
            id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
            item_id=ci.item_id, quantity=ci.quantity,
            customizations=resolved_customizations,
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
    if option_ids:
        await _validate_customization_options(option_ids, req.item_id, db)

    # Find existing cart item with same item_id AND customization_hash
    hash_val = _hash_option_ids(option_ids)
    dupe_query = select(CartItem).where(
        CartItem.user_id == user.id,
        CartItem.item_id == req.item_id,
        CartItem.store_id == req.store_id,
        CartItem.customization_hash == hash_val,
    )
    dupe_result = await db.execute(dupe_query)
    existing_cart = dupe_result.scalar_one_or_none()
    if existing_cart:
        existing_cart.quantity += req.quantity
        await db.flush()
        return CartItemOut(
            id=existing_cart.id, user_id=user.id, store_id=existing_cart.store_id,
            item_id=existing_cart.item_id, quantity=existing_cart.quantity,
            customizations=None,
            customization_option_ids=existing_cart.customization_option_ids,
            unit_price=to_float(existing_cart.unit_price),
            item_name=menu_item.name, created_at=existing_cart.created_at,
        )

    ci = CartItem(
        user_id=user.id, store_id=req.store_id, item_id=req.item_id,
        quantity=req.quantity,
        customization_option_ids=option_ids,
        customization_hash=hash_val,
        unit_price=menu_item.base_price,
    )
    db.add(ci)
    await db.flush()
    return CartItemOut(
        id=ci.id, user_id=user.id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=None,
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
            await _validate_customization_options(option_ids, ci.item_id, db)
        ci.customization_option_ids = option_ids if option_ids else None
        ci.customization_hash = _hash_option_ids(option_ids)
    await db.flush()
    item_result = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
    menu_item = item_result.scalar_one_or_none()
    return CartItemOut(
        id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=None,
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
