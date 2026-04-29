from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import get_db
from app.core.utils import to_float
from app.models.menu import MenuCategory, MenuItem
from app.models.marketing import CustomizationOption
from app.schemas.menu import (
    MenuCategoryOut, CategoryCreate, MenuItemOut, MenuItemCreate, MenuItemUpdate,
)

router = APIRouter(prefix="/menu", tags=["Menu"])


@router.get("/categories", response_model=list[MenuCategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.is_active == True)
        .order_by(MenuCategory.display_order)
    )
    return result.scalars().all()


@router.get("/items", response_model=list[MenuItemOut])
async def list_items(
    category: int | None = None,
    featured: bool | None = None,
    available_only: bool = False,
    dietary: str | None = None,
    limit: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List menu items from the universal HQ menu.

    Query params:
      - category: filter by category_id
      - featured: when true, only return items admin-marked as featured
      - available_only: when true, hide items toggled off by admin
      - dietary: comma-separated tags filter (e.g. "vegan,gluten-free")
      - limit: cap the number of results
    """
    q = select(MenuItem).where(MenuItem.deleted_at.is_(None))
    # Only show items from active categories
    q = q.join(MenuCategory, MenuItem.category_id == MenuCategory.id).where(MenuCategory.is_active == True)
    if category:
        q = q.where(MenuItem.category_id == category)
    if featured is True:
        q = q.where(MenuItem.is_featured == True)
    if available_only:
        q = q.where(MenuItem.is_available == True)
    if dietary:
        tags = [t.strip().lower() for t in dietary.split(",") if t.strip()]
        for tag in tags:
            q = q.where(
                cast(MenuItem.dietary_tags, JSONB).op('@>')(cast([tag], JSONB))
            )
    q = q.order_by(MenuItem.display_order)
    if limit:
        q = q.limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()

    # Attach customization_count to each item
    item_ids = [item.id for item in items]
    if item_ids:
        from sqlalchemy import func as sa_func

        count_result = await db.execute(
            select(CustomizationOption.menu_item_id, sa_func.count(CustomizationOption.id))
            .where(
                CustomizationOption.menu_item_id.in_(item_ids),
                CustomizationOption.is_active == True,
            )
            .group_by(CustomizationOption.menu_item_id)
        )
        counts = {row.menu_item_id: row.count for row in count_result.all()}  # type: ignore
        for item in items:
            item.customization_count = counts.get(item.id, 0)  # type: ignore

    return items


@router.get("/items/search", response_model=list[MenuItemOut])
async def search_items(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    query = select(MenuItem).where(MenuItem.is_available == True, MenuItem.deleted_at.is_(None))
    query = query.where(MenuItem.name.ilike(f"%{q}%"))
    query = query.order_by(MenuItem.display_order)
    result = await db.execute(query.limit(20))
    return result.scalars().all()


@router.get("/items/popular", response_model=list[MenuItemOut])
async def popular_items(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.is_available == True, MenuItem.deleted_at.is_(None))
        .order_by(MenuItem.popularity.desc().nullslast(), MenuItem.display_order)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/items/{item_id}/customizations")
async def list_customizations_public(item_id: int, db: AsyncSession = Depends(get_db)):
    """Public endpoint: list available customization options for a menu item."""
    result = await db.execute(
        select(CustomizationOption)
        .where(
            CustomizationOption.menu_item_id == item_id,
            CustomizationOption.is_active == True,
        )
        .order_by(CustomizationOption.display_order)
    )
    return [{"id": c.id, "name": c.name, "option_type": c.option_type, "price_adjustment": to_float(c.price_adjustment)} for c in result.scalars().all()]

@router.get("/stores")
async def list_stores_public(db: AsyncSession = Depends(get_db)):
    """Public endpoint: list all active stores."""
    from app.models.store import Store
    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(Store).where(Store.is_active == True).order_by(Store.name)
    )
    stores = result.scalars().all()
    return [{"id": s.id, "name": s.name, "address": s.address, "slug": s.slug}
            for s in stores]
