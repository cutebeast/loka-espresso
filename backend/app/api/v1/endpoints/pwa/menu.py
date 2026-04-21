from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.utils import to_float
from app.models.menu import MenuCategory, MenuItem
from app.models.marketing import CustomizationOption
from app.schemas.menu import (
    MenuCategoryOut, CategoryCreate, MenuItemOut, MenuItemCreate, MenuItemUpdate,
)

UNIVERSAL_MENU_STORE_ID = 0

router = APIRouter(prefix="/stores/{store_id}", tags=["Menu"])


@router.get("/categories", response_model=list[MenuCategoryOut])
async def list_categories(store_id: int, db: AsyncSession = Depends(get_db)):
    # Universal menu: always serve from HQ (store_id=0)
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.store_id == UNIVERSAL_MENU_STORE_ID)
        .order_by(MenuCategory.display_order)
    )
    return result.scalars().all()


@router.get("/items", response_model=list[MenuItemOut])
async def list_items(
    store_id: int,
    category: int | None = None,
    featured: bool | None = None,
    available_only: bool = False,
    limit: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List menu items for the universal HQ menu.

    Query params:
      - category: filter by category_id
      - featured: when true, only return items admin-marked as featured
                  (shown on home page "Today's recommendations")
      - available_only: when true, hide items toggled off by store staff
      - limit: cap the number of results
    """
    # Universal menu: always serve from HQ (store_id=0)
    q = select(MenuItem).where(
        MenuItem.store_id == UNIVERSAL_MENU_STORE_ID,
        MenuItem.deleted_at.is_(None),
    )
    if category:
        q = q.where(MenuItem.category_id == category)
    if featured is True:
        q = q.where(MenuItem.is_featured == True)
    if available_only:
        q = q.where(MenuItem.is_available == True)
    q = q.order_by(MenuItem.display_order)
    if limit:
        q = q.limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/items/search", response_model=list[MenuItemOut])
async def search_items(
    q: str = Query(..., min_length=1),
    store_id_override: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Defaults to store_id=0 (HQ) — universal menu
    sid = store_id_override if store_id_override is not None else UNIVERSAL_MENU_STORE_ID
    query = select(MenuItem).where(MenuItem.is_available == True, MenuItem.deleted_at.is_(None))
    if sid:
        query = query.where(MenuItem.store_id == sid)
    query = query.where(MenuItem.name.ilike(f"%{q}%"))
    query = query.order_by(MenuItem.display_order)
    result = await db.execute(query.limit(20))
    return result.scalars().all()


@router.get("/items/popular", response_model=list[MenuItemOut])
async def popular_items(
    store_id: int,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    # Universal menu: always serve from HQ (store_id=0)
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.store_id == UNIVERSAL_MENU_STORE_ID, MenuItem.is_available == True, MenuItem.deleted_at.is_(None))
        .order_by(MenuItem.display_order)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/items/{item_id}/customizations")
async def list_customizations_public(store_id: int, item_id: int, db: AsyncSession = Depends(get_db)):
    """Public endpoint: list available customization options for a menu item."""
    result = await db.execute(
        select(CustomizationOption)
        .where(
            CustomizationOption.menu_item_id == item_id,
            CustomizationOption.is_active == True,
        )
        .order_by(CustomizationOption.display_order)
    )
    return [{"id": c.id, "name": c.name, "price_adjustment": to_float(c.price_adjustment)} for c in result.scalars().all()]
