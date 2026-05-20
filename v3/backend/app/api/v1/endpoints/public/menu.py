"""Public menu endpoints (no auth required)."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DBDependency
from app.models.menu import (
    Allergen,
    DietaryTag,
    MenuCategory,
    MenuItem,
    MenuItemAllergen,
    MenuItemDietaryTag,
    MenuModifierGroup,
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

    # Variants
    variants_result = await db.execute(
        select(MenuVariant).where(
            MenuVariant.parent_item_id.in_(item_ids),
            MenuVariant.is_available.is_(True),
        )
    )
    variants_map: dict[int, list] = {}
    for v in variants_result.scalars().all():
        variants_map.setdefault(v.parent_item_id, []).append(v)

    # Modifier groups with options (selectinload avoids N+1)
    mg_result = await db.execute(
        select(MenuModifierGroup)
        .options(selectinload(MenuModifierGroup.options))
        .where(MenuModifierGroup.menu_item_id.in_(item_ids))
    )
    modifier_map: dict[int, list] = {}
    for mg in mg_result.scalars().all():
        group_out = MenuModifierGroupOut.model_validate(mg)
        group_out.options = [
            MenuModifierOptionOut.model_validate(opt)
            for opt in mg.options
            if opt.is_available
        ]
        modifier_map.setdefault(mg.menu_item_id, []).append(group_out)

    # Allergens via junction table (single-query join)
    allergen_map: dict[int, list] = {}
    if item_ids:
        allergen_result = await db.execute(
            select(MenuItemAllergen.menu_item_id, Allergen)
            .join(Allergen, Allergen.id == MenuItemAllergen.allergen_id)
            .where(MenuItemAllergen.menu_item_id.in_(item_ids))
        )
        for mi_id, allergen in allergen_result.all():
            allergen_map.setdefault(mi_id, []).append(AllergenOut.model_validate(allergen))

    # Dietary tags via junction table (single-query join)
    dietary_map: dict[int, list[str]] = {}
    if item_ids:
        dietary_result = await db.execute(
            select(MenuItemDietaryTag.menu_item_id, DietaryTag.tag_key)
            .join(DietaryTag, DietaryTag.id == MenuItemDietaryTag.dietary_tag_id)
            .where(MenuItemDietaryTag.menu_item_id.in_(item_ids))
        )
        for mi_id, tag_key in dietary_result.all():
            dietary_map.setdefault(mi_id, []).append(tag_key)

    # Build output
    item_outs = []
    for item in items:
        item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
        item_dict["variants"] = [
            MenuVariantOut.model_validate(v) for v in variants_map.get(item.id, [])
        ]
        item_dict["modifier_groups"] = modifier_map.get(item.id, [])
        item_dict["allergens"] = allergen_map.get(item.id, [])
        item_dict["dietary_tags"] = dietary_map.get(item.id) or None
        item_outs.append(MenuItemPublicOut.model_validate(item_dict))

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

    # Variants
    variants_result = await db.execute(
        select(MenuVariant).where(
            MenuVariant.parent_item_id == item_id,
            MenuVariant.is_available.is_(True),
        )
    )
    variants = [MenuVariantOut.model_validate(v) for v in variants_result.scalars().all()]

    # Modifier groups with options
    mg_result = await db.execute(
        select(MenuModifierGroup)
        .options(selectinload(MenuModifierGroup.options))
        .where(MenuModifierGroup.menu_item_id == item_id)
    )
    modifier_outs = []
    for mg in mg_result.scalars().all():
        group_out = MenuModifierGroupOut.model_validate(mg)
        group_out.options = [
            MenuModifierOptionOut.model_validate(opt)
            for opt in mg.options
            if opt.is_available
        ]
        modifier_outs.append(group_out)

    # Allergens (single-query join)
    allergen_result = await db.execute(
        select(MenuItemAllergen.menu_item_id, Allergen)
        .join(Allergen, Allergen.id == MenuItemAllergen.allergen_id)
        .where(MenuItemAllergen.menu_item_id == item_id)
    )
    allergen_outs = [AllergenOut.model_validate(a) for _, a in allergen_result.all()]

    # Dietary tags (single-query join)
    dietary_result = await db.execute(
        select(MenuItemDietaryTag.menu_item_id, DietaryTag.tag_key)
        .join(DietaryTag, DietaryTag.id == MenuItemDietaryTag.dietary_tag_id)
        .where(MenuItemDietaryTag.menu_item_id == item_id)
    )
    dietary_tags = [tag_key for _, tag_key in dietary_result.all()] or None

    item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    item_dict["variants"] = variants
    item_dict["modifier_groups"] = modifier_outs
    item_dict["allergens"] = allergen_outs
    item_dict["dietary_tags"] = dietary_tags

    return APIResponse(data=MenuItemPublicOut.model_validate(item_dict))
