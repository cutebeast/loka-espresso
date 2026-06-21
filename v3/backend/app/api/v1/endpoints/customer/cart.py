"""Customer cart endpoints."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.models.cart import CartLineItem, CustomerCart
from app.schemas.base import APIResponse
from app.schemas.cart import CartLineItemCreate, CartLineItemOut, CartLineItemUpdate, CustomerCartOut
from app.services.cart import (
    CartError,
    add_line_item,
    clear_cart,
    get_or_create_cart,
    remove_line_item,
    update_line_item,
)


async def _load_cart_line_items(db, cart_id: int) -> list[CartLineItemOut]:
    li_result = await db.execute(
        select(CartLineItem)
        .options(selectinload(CartLineItem.menu_item))
        .where(CartLineItem.cart_id == cart_id)
    )
    line_items = []
    for li in li_result.scalars().all():
        li_out = CartLineItemOut.model_validate(li)
        li_out.item_name = li.menu_item.item_name if li.menu_item else None
        li_out.image_url = li.menu_item.image_url if li.menu_item else None
        line_items.append(li_out)
    return line_items


def _build_cart_out(cart, line_items: list | None = None) -> CustomerCartOut:
    """Build CustomerCartOut from Cart model without lazy-loading relationships."""
    cols = {c.name: getattr(cart, c.name) for c in cart.__table__.columns}
    return CustomerCartOut(
        id=cols["id"],
        customer_id=cols["customer_id"],
        store_id=cols["store_id"],
        item_count=cols.get("item_count", len(line_items) if line_items is not None else 0),
        subtotal=float(cols.get("subtotal", 0) or 0),
        last_activity_at=cols.get("last_activity_at", cols.get("updated_at")),
        line_items=line_items or [],
        created_at=cols["created_at"],
        updated_at=cols.get("updated_at", cols["created_at"]),
    )

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=APIResponse[CustomerCartOut])
async def get_cart(customer: ActiveCustomer, db: DBDependency, store_id: int = Query(1, ge=1)):
    """Get or create cart for customer at a store."""
    cart = await get_or_create_cart(db, customer.id, store_id)
    await db.commit()
    line_items = await _load_cart_line_items(db, cart.id)
    cart_out = _build_cart_out(cart, line_items)
    return APIResponse(data=cart_out)


@router.get("/items", response_model=APIResponse[list[CartLineItemOut]])
async def list_cart_items(customer: ActiveCustomer, db: DBDependency, store_id: int = Query(1, ge=1)):
    """List all line items in the cart."""
    cart = await get_or_create_cart(db, customer.id, store_id)
    result = await db.execute(
        select(CartLineItem)
        .options(selectinload(CartLineItem.menu_item))
        .where(CartLineItem.cart_id == cart.id)
    )
    items = []
    for i in result.scalars().all():
        li_out = CartLineItemOut.model_validate(i)
        li_out.item_name = i.menu_item.item_name if i.menu_item else None
        li_out.image_url = i.menu_item.image_url if i.menu_item else None
        items.append(li_out)
    return APIResponse(data=items)


@router.post("/items", response_model=APIResponse[CustomerCartOut])
async def add_item(
    customer: ActiveCustomer,
    db: DBDependency,
    data: CartLineItemCreate,
    store_id: int = Query(1, ge=1),
):
    """Add an item to the cart."""
    try:
        cart = await add_line_item(db, customer.id, store_id, data)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    line_items = await _load_cart_line_items(db, cart.id)
    return APIResponse(data=_build_cart_out(cart, line_items))



@router.patch("/items/{line_item_id}", response_model=APIResponse[CustomerCartOut])
async def update_item(
    customer: ActiveCustomer,
    db: DBDependency,
    line_item_id: int,
    data: CartLineItemUpdate,
):
    """Update a cart line item quantity or modifiers."""
    try:
        cart = await update_line_item(db, customer.id, line_item_id, data)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    line_items = await _load_cart_line_items(db, cart.id)
    return APIResponse(data=_build_cart_out(cart, line_items))



@router.delete("/items/{line_item_id}", response_model=APIResponse[CustomerCartOut])
async def delete_item(customer: ActiveCustomer, db: DBDependency, line_item_id: int):
    """Remove a line item from the cart."""
    try:
        cart = await remove_line_item(db, customer.id, line_item_id)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    line_items = await _load_cart_line_items(db, cart.id)
    return APIResponse(data=_build_cart_out(cart, line_items))
@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def empty_cart(customer: ActiveCustomer, db: DBDependency, store_id: int):
    """Clear all items from the cart."""
    try:
        await clear_cart(db, customer.id, store_id)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return None
