"""Staff menu and branding read endpoints."""

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.menu import (
    MenuItem,
    MenuModifierGroup,
    MenuCategory,
    MenuVariant,
    MenuItemAllergen,
    Allergen,
    MenuItemDietaryTag,
    DietaryTag,
)
from app.models.platform import PlatformConfig
from app.schemas.base import APIResponse
from app.schemas.menu import (
    AllergenOut,
    MenuModifierGroupOut,
    MenuModifierOptionOut,
    MenuVariantOut,
)

router = APIRouter(tags=["staff — menu"])


# ── Public Branding Config ──

@router.get("/staff/config/branding")
async def branding_config(db: DBDependency):
    """Public branding config — no auth required."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("branding."))
    )
    items = {c.config_key: c.config_value for c in result.scalars().all()}
    return APIResponse(data=items)


@router.get("/staff/config/staff-meal")
async def staff_meal_config(staff: CurrentStaff, db: DBDependency):
    """Staff meal discount config (staffmeal.* platform config, set by admin).

    Values are JSONB: discount_type is a JSON string, discount_value a number.
    """
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.startswith("staffmeal."))
    )
    items = {c.config_key: c.config_value for c in result.scalars().all()}
    discount_type = items.get("staffmeal.discount_type") or "percentage"
    if discount_type not in ("percentage", "fixed"):
        discount_type = "percentage"
    try:
        discount_value = float(items.get("staffmeal.discount_value") or 0)
    except (TypeError, ValueError):
        discount_value = 0
    return APIResponse(data={
        "discount_type": discount_type,
        "discount_value": discount_value,
    })


# ── Staff read endpoints (menu, tables, orders, reservations) ──
# These endpoints let staff portal pages fetch data using their staff token
# instead of calling /admin/* endpoints which require an admin token.

@router.get("/staff/menu/categories")
async def staff_list_menu_categories(
    staff: CurrentStaff,
    db: DBDependency,
    per_page: int = Query(100, ge=1, le=500),
):
    """List menu categories for the staff member's store.

    Includes the experiences category: workshops are sellable at POS, but the
    order endpoint enforces a session + attached customer for them."""
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.deleted_at.is_(None))
        .order_by(MenuCategory.display_order)
        .limit(per_page)
    )
    cats = result.scalars().all()
    return APIResponse(data=[{"id": c.id, "category_name": c.category_name, "slug": c.slug, "display_order": c.display_order, "is_available": c.is_available} for c in cats])


@router.get("/staff/menu/items")
async def staff_list_menu_items(
    staff: CurrentStaff,
    db: DBDependency,
    per_page: int = Query(500, ge=1, le=1000),
    category_id: int | None = Query(None),
):
    """List menu items for the staff member's store (full POS shape)."""
    stmt = (
        select(MenuItem)
        .where(MenuItem.deleted_at.is_(None), MenuItem.is_available.is_(True))
        .order_by(MenuItem.category_id, MenuItem.display_order)
        .limit(per_page)
    )
    if category_id:
        stmt = stmt.where(MenuItem.category_id == category_id)
    result = await db.execute(stmt)
    items = result.scalars().all()
    item_ids = [m.id for m in items]

    # Category names
    cat_ids = {m.category_id for m in items if m.category_id}
    cat_result = await db.execute(select(MenuCategory).where(MenuCategory.id.in_(cat_ids)))
    cat_map = {c.id: c.category_name for c in cat_result.scalars().all()}

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

    # Modifier groups with options
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
        modifier_map.setdefault(mg.menu_item_id, []).append(group_out.model_dump())

    # Allergens
    allergen_map: dict[int, list] = {}
    if item_ids:
        allergen_result = await db.execute(
            select(MenuItemAllergen.menu_item_id, Allergen)
            .join(Allergen, Allergen.id == MenuItemAllergen.allergen_id)
            .where(MenuItemAllergen.menu_item_id.in_(item_ids))
        )
        for mi_id, allergen in allergen_result.all():
            allergen_map.setdefault(mi_id, []).append(AllergenOut.model_validate(allergen).model_dump())

    # Dietary tags
    dietary_map: dict[int, list[str]] = {}
    if item_ids:
        dietary_result = await db.execute(
            select(MenuItemDietaryTag.menu_item_id, DietaryTag.tag_key)
            .join(DietaryTag, DietaryTag.id == MenuItemDietaryTag.dietary_tag_id)
            .where(MenuItemDietaryTag.menu_item_id.in_(item_ids))
        )
        for mi_id, tag_key in dietary_result.all():
            dietary_map.setdefault(mi_id, []).append(tag_key)

    out = []
    for m in items:
        item_dict = {c: getattr(m, c) for c in m.__table__.columns.keys()}
        item_dict["base_price"] = float(m.base_price) if m.base_price else 0
        item_dict["category_name"] = cat_map.get(m.category_id)
        item_dict["variants"] = [
            MenuVariantOut.model_validate(v).model_dump() for v in variants_map.get(m.id, [])
        ]
        item_dict["modifier_groups"] = modifier_map.get(m.id, [])
        item_dict["allergens"] = allergen_map.get(m.id, [])
        item_dict["dietary_tags"] = dietary_map.get(m.id) or None
        out.append(item_dict)
    return APIResponse(data=out)
