"""Public menu endpoints (no auth required)."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.deps import DBDependency
from app.models.menu import (
    Allergen,
    MenuCategory,
    MenuItem,
    MenuItemAllergen,
    MenuModifierGroup,
    MenuModifierOption,
    MenuVariant,
)
from app.schemas.base import APIResponse
from app.schemas.menu import (
    AllergenOut,
    MenuCategoryOut,
    MenuItemPublicOut,
    MenuModifierGroupOut,
    MenuModifierOptionOut,
    MenuPublicOut,
    MenuVariantOut,
)

router = APIRouter(prefix="/menu", tags=["public — menu"])


@router.get("/stores/{store_id}", response_model=APIResponse[MenuPublicOut])
async def get_store_menu(
    db: DBDependency,
    store_id: int,
    category_id: int | None = Query(None),
    search: str | None = Query(None, max_length=100),
    is_featured: bool | None = Query(None),
):
    """Get full public menu for a store."""
    # Fetch categories (global menu, not per-store)
    cat_stmt = select(MenuCategory).where(
        MenuCategory.is_available.is_(True),
        MenuCategory.deleted_at.is_(None),
    ).order_by(MenuCategory.display_order)
    cat_result = await db.execute(cat_stmt)
    categories = cat_result.scalars().all()
    
    # Fetch items (global menu, not per-store)
    item_stmt = select(MenuItem).where(
        MenuItem.is_available.is_(True),
        MenuItem.deleted_at.is_(None),
    )
    if category_id:
        item_stmt = item_stmt.where(MenuItem.category_id == category_id)
    if search:
        item_stmt = item_stmt.where(
            MenuItem.item_name.ilike(f"%{search}%")
            | MenuItem.description.ilike(f"%{search}%")
        )
    if is_featured is not None:
        item_stmt = item_stmt.where(MenuItem.is_featured.is_(is_featured))
    
    item_result = await db.execute(item_stmt)
    items = item_result.scalars().all()
    item_ids = [i.id for i in items]
    
    # Fetch related data in bulk
    variants_result = await db.execute(
        select(MenuVariant).where(
            MenuVariant.parent_item_id.in_(item_ids),
            MenuVariant.is_available.is_(True),
        )
    )
    variants_map = {}
    for v in variants_result.scalars().all():
        variants_map.setdefault(v.parent_item_id, []).append(v)
    
    modifiers_result = await db.execute(
        select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id.in_(item_ids))
    )
    modifier_groups = modifiers_result.scalars().all()
    group_ids = [g.id for g in modifier_groups]
    
    options_result = await db.execute(
        select(MenuModifierOption).where(
            MenuModifierOption.modifier_group_id.in_(group_ids),
            MenuModifierOption.is_available.is_(True),
        )
    )
    options_map = {}
    for o in options_result.scalars().all():
        options_map.setdefault(o.modifier_group_id, []).append(o)
    
    modifiers_map = {}
    for g in modifier_groups:
        group_out = MenuModifierGroupOut.model_validate(g)
        group_out.options = [MenuModifierOptionOut.model_validate(o) for o in options_map.get(g.id, [])]
        modifiers_map.setdefault(g.menu_item_id, []).append(group_out)
    
    # Fetch allergens
    allergen_links = await db.execute(
        select(MenuItemAllergen).where(MenuItemAllergen.menu_item_id.in_(item_ids))
    )
    allergen_ids = {a.allergen_id for a in allergen_links.scalars().all()}
    allergen_result = await db.execute(select(Allergen).where(Allergen.id.in_(allergen_ids)))
    allergen_map = {a.id: AllergenOut.model_validate(a) for a in allergen_result.scalars().all()}
    
    item_allergen_map = {}
    for link in allergen_links.scalars().all():
        item_allergen_map.setdefault(link.menu_item_id, []).append(allergen_map.get(link.allergen_id))
    
    # Build output — use column dict to avoid lazy-loading relationships
    item_outs = []
    for item in items:
        item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
        item_out = MenuItemPublicOut.model_validate(item_dict)
        item_out.variants = [MenuVariantOut.model_validate(v) for v in variants_map.get(item.id, [])]
        item_out.modifier_groups = modifiers_map.get(item.id, [])
        item_out.allergens = [a for a in item_allergen_map.get(item.id, []) if a is not None]
        # Convert dietary_tags JSONB to list if needed
        if item.dietary_tags and isinstance(item.dietary_tags, dict):
            item_out.dietary_tags = list(item.dietary_tags.keys()) if item.dietary_tags else None
        item_outs.append(item_out)
    
    cat_outs = [MenuCategoryOut.model_validate(c) for c in categories]
    
    return APIResponse(
        data=MenuPublicOut(
            store_id=store_id,
            categories=cat_outs,
            items=item_outs,
        )
    )


@router.get("/items/{item_id}", response_model=APIResponse[MenuItemPublicOut])
async def get_menu_item(db: DBDependency, item_id: int):
    """Get public menu item details."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.is_available.is_(True),
            MenuItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    variants_result = await db.execute(
        select(MenuVariant).where(
            MenuVariant.parent_item_id == item_id,
            MenuVariant.is_available.is_(True),
        )
    )
    modifiers_result = await db.execute(
        select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id == item_id)
    )
    modifier_groups = modifiers_result.scalars().all()
    group_ids = [g.id for g in modifier_groups]
    
    options_result = await db.execute(
        select(MenuModifierOption).where(
            MenuModifierOption.modifier_group_id.in_(group_ids),
            MenuModifierOption.is_available.is_(True),
        )
    )
    options_map = {}
    for o in options_result.scalars().all():
        options_map.setdefault(o.modifier_group_id, []).append(o)
    
    modifier_outs = []
    for g in modifier_groups:
        group_out = MenuModifierGroupOut.model_validate(g)
        group_out.options = [MenuModifierOptionOut.model_validate(o) for o in options_map.get(g.id, [])]
        modifier_outs.append(group_out)
    
    allergen_links = await db.execute(
        select(MenuItemAllergen).where(MenuItemAllergen.menu_item_id == item_id)
    )
    allergen_ids = {a.allergen_id for a in allergen_links.scalars().all()}
    allergen_result = await db.execute(select(Allergen).where(Allergen.id.in_(allergen_ids)))
    allergen_outs = [AllergenOut.model_validate(a) for a in allergen_result.scalars().all()]
    
    item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    item_out = MenuItemPublicOut.model_validate(item_dict)
    item_out.variants = [MenuVariantOut.model_validate(v) for v in variants_result.scalars().all()]
    item_out.modifier_groups = modifier_outs
    item_out.allergens = allergen_outs
    if item.dietary_tags and isinstance(item.dietary_tags, dict):
        item_out.dietary_tags = list(item.dietary_tags.keys()) if item.dietary_tags else None

    return APIResponse(data=item_out)
