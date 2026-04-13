from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.order import CartItem
from app.models.menu import MenuItem
from app.models.store import Store
from app.schemas.cart import CartItemCreate, CartItemUpdate, CartItemOut, CartOut

router = APIRouter(prefix="/cart", tags=["Cart"])


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
        subtotal += float(ci.unit_price) * ci.quantity
        cart_items.append(CartItemOut(
            id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
            item_id=ci.item_id, quantity=ci.quantity,
            customizations=ci.customizations, unit_price=float(ci.unit_price),
            item_name=name, created_at=ci.created_at,
        ))
    return CartOut(store_id=store_id, store_name=store_name, items=cart_items, subtotal=round(subtotal, 2))


@router.post("/items", response_model=CartItemOut, status_code=201)
async def add_to_cart(req: CartItemCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
    existing_items = existing.scalars().all()
    cart_cleared = False
    if existing_items and existing_items[0].store_id != req.store_id:
        # Clear cart from previous store to prevent cross-store pollution
        for ei in existing_items:
            await db.delete(ei)
        await db.flush()
        cart_cleared = True

    item_result = await db.execute(select(MenuItem).where(MenuItem.id == req.item_id))
    menu_item = item_result.scalar_one_or_none()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Menu item not found")

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
        if req.customizations:
            existing_cart.customizations = req.customizations
        await db.flush()
        return CartItemOut(
            id=existing_cart.id, user_id=user.id, store_id=existing_cart.store_id,
            item_id=existing_cart.item_id, quantity=existing_cart.quantity,
            customizations=existing_cart.customizations, unit_price=float(existing_cart.unit_price),
            item_name=menu_item.name, created_at=existing_cart.created_at,
        )

    ci = CartItem(
        user_id=user.id, store_id=req.store_id, item_id=req.item_id,
        quantity=req.quantity, customizations=req.customizations,
        unit_price=menu_item.base_price,
    )
    db.add(ci)
    await db.flush()
    return CartItemOut(
        id=ci.id, user_id=user.id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=ci.customizations, unit_price=float(ci.unit_price),
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
    if req.customizations is not None:
        ci.customizations = req.customizations
    await db.flush()
    item_result = await db.execute(select(MenuItem).where(MenuItem.id == ci.item_id))
    menu_item = item_result.scalar_one_or_none()
    return CartItemOut(
        id=ci.id, user_id=ci.user_id, store_id=ci.store_id,
        item_id=ci.item_id, quantity=ci.quantity,
        customizations=ci.customizations, unit_price=float(ci.unit_price),
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
