"""Customer cart endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

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

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("", response_model=APIResponse[CustomerCartOut])
async def get_cart(customer: ActiveCustomer, db: DBDependency, store_id: int):
    """Get or create cart for customer at a store."""
    cart = await get_or_create_cart(db, customer.id, store_id)
    await db.commit()
    return APIResponse(data=CustomerCartOut.model_validate(cart))


@router.get("/items", response_model=APIResponse[list[CartLineItemOut]])
async def list_cart_items(customer: ActiveCustomer, db: DBDependency, store_id: int):
    """List all line items in the cart."""
    cart = await get_or_create_cart(db, customer.id, store_id)
    result = await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    items = [CartLineItemOut.model_validate(i) for i in result.scalars().all()]
    return APIResponse(data=items)


@router.post("/items", response_model=APIResponse[CustomerCartOut])
async def add_item(
    customer: ActiveCustomer,
    db: DBDependency,
    store_id: int,
    data: CartLineItemCreate,
):
    """Add an item to the cart."""
    try:
        cart = await add_line_item(db, customer.id, store_id, data)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return APIResponse(data=CustomerCartOut.model_validate(cart))


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
    return APIResponse(data=CustomerCartOut.model_validate(cart))


@router.delete("/items/{line_item_id}", response_model=APIResponse[CustomerCartOut])
async def delete_item(customer: ActiveCustomer, db: DBDependency, line_item_id: int):
    """Remove a line item from the cart."""
    try:
        cart = await remove_line_item(db, customer.id, line_item_id)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return APIResponse(data=CustomerCartOut.model_validate(cart))


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def empty_cart(customer: ActiveCustomer, db: DBDependency, store_id: int):
    """Clear all items from the cart."""
    try:
        await clear_cart(db, customer.id, store_id)
    except CartError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return None
