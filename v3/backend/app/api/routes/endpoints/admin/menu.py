"""Admin menu management endpoints."""
import logging
from datetime import datetime, timezone
from typing import Literal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.menu import (
    Allergen,
    DietaryTag,
    MenuCategory,
    MenuItem,
    MenuItemAllergen,
    MenuItemDietaryTag,
    MenuItemRecipe,
    MenuModifierGroup,
    MenuModifierOption,
    MenuVariant,
    TaxCategory,
)
from app.schemas.base import APIResponse, BaseSchema, PaginatedResponse, TimestampedSchema
from app.schemas.menu import (
    AllergenOut,
    MenuCategoryCreate,
    MenuCategoryOut,
    MenuCategoryUpdate,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    MenuModifierGroupOut,
    MenuModifierOptionOut,
    MenuVariantOut,
    MenuItemRecipeOut,
)
from app.services.translation import auto_translate_record, delete_translations

async def _translate_item_modifiers(db, item_id: int):
    """Translate all modifier groups and options for a menu item."""
    try:
        mg_result = await db.execute(
            select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id == item_id)
        )
        for mg in mg_result.scalars().all():
            await auto_translate_record(db, "menu_modifier_groups", mg.id, {"group_name": mg.group_name})
            opt_result = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.modifier_group_id == mg.id)
            )
            for opt in opt_result.scalars().all():
                await auto_translate_record(db, "menu_modifier_options", opt.id, {"option_name": opt.option_name})
    except Exception:
        logger.debug("Non-blocking error", exc_info=True)


router = APIRouter(prefix="/admin/menu", tags=["admin — menu"])


# ---------------------------------------------------------------------------
# Inline request/response schemas
# ---------------------------------------------------------------------------

class _MenuModifierOptionInline(BaseSchema):
    option_name: str
    price_adjustment: float = 0
    is_default: bool = False
    is_available: bool = True
    display_order: int = 0


class _MenuModifierGroupInline(BaseSchema):
    group_name: str
    display_order: int = 0
    selection_type: Literal["single", "multiple"] = "single"
    is_required: bool = False
    min_selections: int = 0
    max_selections: int = 1
    options: list[_MenuModifierOptionInline] = []


class _MenuVariantInline(BaseSchema):
    variant_name: str
    variant_sku: str
    price_adjustment: float = 0
    is_default: bool = False
    is_available: bool = True


class _MenuItemRecipeInline(BaseSchema):
    inventory_item_id: int
    menu_variant_id: int | None = None
    quantity_required: float = Field(1.0, gt=0)
    unit_of_measure: str = "unit"
    is_primary_component: bool = False
    waste_factor: float = Field(0.05, ge=0, le=1)


async def _validate_recipe_payloads(
    db, item_id: int, recipes: list[dict]
) -> list[dict]:
    """Validate + normalize raw recipe dicts (shared by create and update).

    - inventory_item_id must exist (active item) — else 400, not an FK 500
    - menu_variant_id must belong to THIS menu item — else 400 (a cross-linked
      recipe would silently never match at deduction time)
    - numeric bounds enforced (quantity_required > 0, 0 <= waste_factor <= 1)
    - duplicates by (menu_variant_id, inventory_item_id) collapse to the LAST
      row — duplicates would double-deduct stock on every sale
    """
    from app.models.inventory import InventoryItem

    normalized: list[dict] = []
    for r_data in recipes:
        if not isinstance(r_data, dict) or r_data.get("inventory_item_id") in (None, ""):
            raise HTTPException(
                status_code=400,
                detail="Each recipe must include 'inventory_item_id'",
            )
        try:
            quantity_required = float(r_data.get("quantity_required", 1.0))
            waste_factor = float(r_data.get("waste_factor", 0.05))
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Recipe 'quantity_required' and 'waste_factor' must be numbers",
            )
        if quantity_required <= 0:
            raise HTTPException(
                status_code=400,
                detail="Recipe 'quantity_required' must be greater than 0",
            )
        if not 0 <= waste_factor <= 1:
            raise HTTPException(
                status_code=400,
                detail="Recipe 'waste_factor' must be between 0 and 1",
            )
        normalized.append({
            "inventory_item_id": int(r_data["inventory_item_id"]),
            "menu_variant_id": r_data.get("menu_variant_id") or None,
            "quantity_required": quantity_required,
            "unit_of_measure": r_data.get("unit_of_measure") or "unit",
            "is_primary_component": bool(r_data.get("is_primary_component", False)),
            "waste_factor": waste_factor,
        })

    inv_ids = {r["inventory_item_id"] for r in normalized}
    if inv_ids:
        inv_result = await db.execute(
            select(InventoryItem.id).where(
                InventoryItem.id.in_(inv_ids),
                InventoryItem.is_active.is_(True),
            )
        )
        valid_inv = {row[0] for row in inv_result.all()}
        invalid_inv = inv_ids - valid_inv
        if invalid_inv:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid inventory item IDs in recipes: {sorted(invalid_inv)}",
            )

    variant_ids = {r["menu_variant_id"] for r in normalized if r["menu_variant_id"] is not None}
    if variant_ids:
        var_result = await db.execute(
            select(MenuVariant.id).where(
                MenuVariant.id.in_(variant_ids),
                MenuVariant.parent_item_id == item_id,
            )
        )
        valid_var = {row[0] for row in var_result.all()}
        invalid_var = variant_ids - valid_var
        if invalid_var:
            raise HTTPException(
                status_code=400,
                detail=f"Recipe menu_variant_id(s) do not belong to this menu item: {sorted(invalid_var)}",
            )

    deduped: dict[tuple, dict] = {}
    for r in normalized:
        deduped[(r["menu_variant_id"], r["inventory_item_id"])] = r
    return list(deduped.values())


class MenuItemCreateRequest(MenuItemCreate):
    modifier_groups: list[_MenuModifierGroupInline] | None = None
    variants: list[_MenuVariantInline] | None = None
    allergen_ids: list[int] | None = None
    dietary_tag_ids: list[int] | None = None
    recipes: list[_MenuItemRecipeInline] | None = None


class AllergenCreate(BaseSchema):
    allergen_key: str
    display_name: str
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] = "high"
    color_hex: str | None = Field(None, max_length=7)
    icon_url: str | None = Field(None, max_length=500)


class AllergenUpdate(BaseSchema):
    allergen_key: str | None = None
    display_name: str | None = None
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    color_hex: str | None = Field(None, max_length=7)
    icon_url: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class TaxCategoryCreate(BaseSchema):
    category_name: str
    rate: float = Field(..., ge=0, le=1)


class TaxCategoryUpdate(BaseSchema):
    category_name: str | None = None
    rate: float | None = Field(None, ge=0, le=1)
    is_active: bool | None = None


class TaxCategoryOut(TimestampedSchema):
    id: int
    category_name: str
    rate: float
    is_active: bool


# ---------------------------------------------------------------------------
# Menu Categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=APIResponse[PaginatedResponse[MenuCategoryOut]])
async def list_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    include_system: bool = Query(False),
):
    """List menu categories (excluding soft-deleted).

    System categories (Experiences, Combo) are hidden by default so they stay
    out of item-category pickers; the workshops page passes include_system=true
    to resolve the Experiences category id.
    """
    base = select(MenuCategory).where(MenuCategory.deleted_at.is_(None))
    count_stmt = select(func.count(MenuCategory.id)).where(MenuCategory.deleted_at.is_(None))
    if not include_system:
        base = base.where(MenuCategory.is_system.is_(False))
        count_stmt = count_stmt.where(MenuCategory.is_system.is_(False))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0
    result = await db.execute(
        base
        .order_by((MenuCategory.category_type != "combo"), MenuCategory.display_order, MenuCategory.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    categories = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[MenuCategoryOut.model_validate(c) for c in categories],
            total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/categories/{id}", response_model=APIResponse[MenuCategoryOut])
async def get_category(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(MenuCategory).where(MenuCategory.id == id, MenuCategory.deleted_at.is_(None)))
    cat = res.scalar_one_or_none()
    if not cat: raise HTTPException(status_code=404, detail="Category not found")
    return APIResponse(data=MenuCategoryOut.model_validate(cat))


@router.post(
    "/categories",
    response_model=APIResponse[MenuCategoryOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    db: DBDependency,
    admin: CurrentAdmin,
    data: MenuCategoryCreate,
):
    """Create a new menu category."""
    dup = await db.execute(
        select(MenuCategory.id).where(
            MenuCategory.slug == data.slug,
            MenuCategory.deleted_at.is_(None),
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Category slug '{data.slug}' already exists")
    category = MenuCategory(**data.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    await auto_translate_record(db, "menu_categories", category.id, {"category_name": category.category_name})
    return APIResponse(data=MenuCategoryOut.model_validate(category))


@router.patch("/categories/{id}", response_model=APIResponse[MenuCategoryOut])
async def update_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: MenuCategoryUpdate,
):
    """Update a menu category."""
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == id,
            MenuCategory.deleted_at.is_(None),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    await db.commit()
    await db.refresh(category)
    await auto_translate_record(db, "menu_categories", category.id, {"category_name": category.category_name})
    return APIResponse(data=MenuCategoryOut.model_validate(category))


@router.delete("/categories/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete a menu category."""
    result = await db.execute(
        select(MenuCategory).where(
            MenuCategory.id == id,
            MenuCategory.deleted_at.is_(None),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    category.is_active = False
    category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "menu_categories", id)
    return None


# ---------------------------------------------------------------------------
# Menu Items
# ---------------------------------------------------------------------------

@router.get("/items", response_model=APIResponse[PaginatedResponse[MenuItemOut]])
async def list_items(
    db: DBDependency,
    admin: CurrentAdmin,
    category_id: int | None = Query(None),
    is_available: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List menu items with optional filters and pagination."""
    base_stmt = select(MenuItem).where(
        MenuItem.deleted_at.is_(None),
    )
    if category_id is not None:
        base_stmt = base_stmt.where(MenuItem.category_id == category_id)
    if is_available is not None:
        base_stmt = base_stmt.where(MenuItem.is_available.is_(is_available))

    count_stmt = select(func.count(MenuItem.id)).where(
        MenuItem.deleted_at.is_(None),
    )
    if category_id is not None:
        count_stmt = count_stmt.where(MenuItem.category_id == category_id)
    if is_available is not None:
        count_stmt = count_stmt.where(MenuItem.is_available.is_(is_available))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(MenuItem.display_order).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = result.scalars().all()

    # Load categories in bulk for list view
    category_ids = {i.category_id for i in items}
    cat_result = await db.execute(
        select(MenuCategory).where(MenuCategory.id.in_(category_ids))
    )
    category_map = {c.id: MenuCategoryOut.model_validate(c) for c in cat_result.scalars().all()}

    # Load allergens and dietary tags in bulk
    item_ids = [i.id for i in items]
    allergen_map: dict[int, list[dict]] = {}
    dietary_map: dict[int, list[dict]] = {}
    if item_ids:
        # Allergens via junction table
        allergen_result = await db.execute(
            select(MenuItemAllergen.menu_item_id, Allergen)
            .join(Allergen, Allergen.id == MenuItemAllergen.allergen_id)
            .where(MenuItemAllergen.menu_item_id.in_(item_ids))
        )
        for mi_id, allergen in allergen_result.all():
            if mi_id not in allergen_map:
                allergen_map[mi_id] = []
            allergen_map[mi_id].append(AllergenOut.model_validate(allergen).model_dump())

        # Dietary tags via junction table
        dietary_result = await db.execute(
            select(MenuItemDietaryTag.menu_item_id, DietaryTag.id, DietaryTag.tag_key, DietaryTag.display_name, DietaryTag.icon)
            .join(DietaryTag, DietaryTag.id == MenuItemDietaryTag.dietary_tag_id)
            .where(MenuItemDietaryTag.menu_item_id.in_(item_ids))
        )
        for mi_id, d_id, d_key, d_name, d_icon in dietary_result.all():
            if mi_id not in dietary_map:
                dietary_map[mi_id] = []
            dietary_map[mi_id].append({"id": d_id, "tag_key": d_key, "display_name": d_name, "icon": d_icon})

    # Load modifier groups and options in bulk
    modifier_map: dict[int, list[dict]] = {}
    modifier_option_map: dict[int, list[dict]] = {}
    if item_ids:
        mg_result = await db.execute(
            select(MenuModifierGroup)
            .options(selectinload(MenuModifierGroup.options))
            .where(MenuModifierGroup.menu_item_id.in_(item_ids))
        )
        for mg in mg_result.scalars().all():
            if mg.menu_item_id not in modifier_map:
                modifier_map[mg.menu_item_id] = []
            options = [MenuModifierOptionOut.model_validate(opt).model_dump() for opt in mg.options]
            modifier_map[mg.menu_item_id].append(
                MenuModifierGroupOut.model_validate(mg).model_dump() | {"options": options}
            )

    # Load variants in bulk
    variant_map: dict[int, list[dict]] = {}
    if item_ids:
        var_result = await db.execute(
            select(MenuVariant).where(MenuVariant.parent_item_id.in_(item_ids))
        )
        for v in var_result.scalars().all():
            if v.parent_item_id not in variant_map:
                variant_map[v.parent_item_id] = []
            variant_map[v.parent_item_id].append(MenuVariantOut.model_validate(v).model_dump())

    # Load recipes in bulk
    recipe_map: dict[int, list[dict]] = {}
    if item_ids:
        recipe_result = await db.execute(
            select(MenuItemRecipe).where(MenuItemRecipe.menu_item_id.in_(item_ids))
        )
        for r in recipe_result.scalars().all():
            if r.menu_item_id not in recipe_map:
                recipe_map[r.menu_item_id] = []
            recipe_map[r.menu_item_id].append(MenuItemRecipeOut.model_validate(r).model_dump())

    item_outs = []
    for item in items:
        item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
        item_dict["category"] = category_map.get(item.category_id)
        item_dict["allergens"] = allergen_map.get(item.id, [])
        item_dict["dietary_tags"] = dietary_map.get(item.id, [])
        item_dict["modifier_groups"] = modifier_map.get(item.id, [])
        item_dict["variants"] = variant_map.get(item.id, [])
        item_dict["recipes"] = recipe_map.get(item.id, [])
        item_outs.append(MenuItemOut.model_validate(item_dict))

    return APIResponse(
        data=PaginatedResponse(
            items=item_outs,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/items",
    response_model=APIResponse[MenuItemOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_item(
    db: DBDependency,
    admin: CurrentAdmin,
    data: MenuItemCreateRequest,
):
    """Create a menu item with optional modifiers, variants, and allergens."""
    dup = await db.execute(
        select(MenuItem.id).where(
            MenuItem.item_code == data.item_code,
            MenuItem.deleted_at.is_(None),
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Item code '{data.item_code}' already exists")
    item_data = data.model_dump(
        exclude={"modifier_groups", "variants", "allergen_ids", "dietary_tag_ids", "recipes"},
        exclude_unset=False,
    )
    item = MenuItem(**item_data)
    db.add(item)
    await db.flush()

    if data.modifier_groups:
        for group_data in data.modifier_groups:
            group = MenuModifierGroup(
                menu_item_id=item.id,
                group_name=group_data.group_name,
                display_order=group_data.display_order,
                selection_type=group_data.selection_type,
                is_required=group_data.is_required,
                min_selections=group_data.min_selections,
                max_selections=group_data.max_selections,
            )
            db.add(group)
            await db.flush()

            for opt_data in group_data.options:
                option = MenuModifierOption(
                    modifier_group_id=group.id,
                    option_name=opt_data.option_name,
                    price_adjustment=opt_data.price_adjustment,
                    is_default=opt_data.is_default,
                    is_available=opt_data.is_available,
                    display_order=opt_data.display_order,
                )
                db.add(option)

    if data.variants:
        for var_data in data.variants:
            variant = MenuVariant(
                parent_item_id=item.id,
                variant_name=var_data.variant_name,
                variant_sku=var_data.variant_sku,
                price_adjustment=var_data.price_adjustment,
                is_default=var_data.is_default,
                is_available=var_data.is_available,
            )
            db.add(variant)
        await db.flush()  # variant IDs needed for recipe ownership validation

    if data.allergen_ids:
        allergen_result = await db.execute(
            select(Allergen.id).where(
                Allergen.id.in_(data.allergen_ids),
                Allergen.deleted_at.is_(None),
            )
        )
        valid_ids = {row[0] for row in allergen_result.all()}
        invalid_ids = set(data.allergen_ids) - valid_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid allergen IDs: {sorted(invalid_ids)}",
            )
        for allergen_id in data.allergen_ids:
            db.add(MenuItemAllergen(menu_item_id=item.id, allergen_id=allergen_id))

    if data.dietary_tag_ids:
        tag_result = await db.execute(
            select(DietaryTag.id).where(
                DietaryTag.id.in_(data.dietary_tag_ids),
                DietaryTag.is_active.is_(True),
            )
        )
        valid_tag_ids = {row[0] for row in tag_result.all()}
        invalid_tag_ids = set(data.dietary_tag_ids) - valid_tag_ids
        if invalid_tag_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid dietary tag IDs: {sorted(invalid_tag_ids)}",
            )
        for dt_id in data.dietary_tag_ids:
            db.add(MenuItemDietaryTag(menu_item_id=item.id, dietary_tag_id=dt_id))

    if data.recipes:
        recipe_dicts = await _validate_recipe_payloads(
            db, item.id, [r.model_dump() for r in data.recipes]
        )
        for r_data in recipe_dicts:
            db.add(MenuItemRecipe(menu_item_id=item.id, **r_data))

    await db.commit()
    await db.refresh(item)

    # Auto-translate menu item name and description for all locales
    await auto_translate_record(db, "menu_items", item.id, {
        "item_name": item.item_name,
        "description": item.description or "",
        "long_description": item.long_description or "",
    })

    await _translate_item_modifiers(db, item.id)
    return APIResponse(data=await _build_menu_item_out(db, item))


@router.get("/items/{id}", response_model=APIResponse[MenuItemOut])
async def get_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get full menu item details."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == id,
            MenuItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")

    await _translate_item_modifiers(db, item.id)
    return APIResponse(data=await _build_menu_item_out(db, item))


@router.patch("/items/{id}", response_model=APIResponse[MenuItemOut])
async def update_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: MenuItemUpdate,
):
    """Update core fields and optionally modifier_groups of a menu item."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == id,
            MenuItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")

    update_data = data.model_dump(exclude_unset=True)

    # Workshops/classes live in the "experiences" category — sealed in BOTH
    # directions: experience items can't move out (they'd vanish from the
    # workshops page/event cards), and regular items can't move in (they'd
    # appear as fake classes).
    if "category_id" in update_data and update_data["category_id"] != item.category_id:
        cur_cat = (await db.execute(
            select(MenuCategory).where(MenuCategory.id == item.category_id)
        )).scalar_one_or_none()
        if cur_cat is not None and cur_cat.slug == "experiences":
            raise HTTPException(
                status_code=400,
                detail="Workshop items must stay in the Experiences category",
            )
        new_cat = (await db.execute(
            select(MenuCategory).where(MenuCategory.id == update_data["category_id"])
        )).scalar_one_or_none()
        if new_cat is not None and new_cat.slug == "experiences":
            raise HTTPException(
                status_code=400,
                detail="Only workshop items can use the Experiences category — create classes from Events & Classes → Workshops",
            )

    modifier_groups_data = update_data.pop("modifier_groups", None)
    allergen_ids_data = update_data.pop("allergen_ids", None)
    dietary_tag_ids_data = update_data.pop("dietary_tag_ids", None)
    recipes_data = update_data.pop("recipes", None)

    # Validate raw-dict sub-payloads up front — they bypass pydantic (typed as
    # list[dict]), so missing keys KeyError-500 and bad values CHECK-500 later.
    if modifier_groups_data is not None:
        for group_data in modifier_groups_data:
            if not isinstance(group_data, dict) or not group_data.get("group_name"):
                raise HTTPException(
                    status_code=400,
                    detail="Each modifier group must include a non-empty 'group_name'",
                )
    if recipes_data is not None:
        recipes_data = await _validate_recipe_payloads(db, item.id, recipes_data)

    for field, value in update_data.items():
        setattr(item, field, value)

    await db.flush()

    # Update modifier groups IN PLACE (keyed by id) — the old delete-and-
    # recreate wiped manually reviewed translations and regenerated IDs on
    # every save, even when nothing about the modifiers changed.
    if modifier_groups_data is not None:
        existing_result = await db.execute(
            select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id == item.id)
        )
        existing_groups = {g.id: g for g in existing_result.scalars().all()}
        seen_group_ids: set[int] = set()

        for group_data in modifier_groups_data:
            gid = group_data.get("id")
            group = existing_groups.get(gid) if gid else None
            if group is None:
                group = MenuModifierGroup(menu_item_id=item.id, group_name=group_data["group_name"])
                db.add(group)
                await db.flush()
            group.group_name = group_data["group_name"]
            group.display_order = group_data.get("display_order", 0)
            group.selection_type = group_data.get("selection_type", "single")
            group.is_required = group_data.get("is_required", False)
            group.min_selections = group_data.get("min_selections", 0)
            group.max_selections = group_data.get("max_selections", 1)
            seen_group_ids.add(group.id)

            opts_result = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.modifier_group_id == group.id)
            )
            existing_opts = {o.id: o for o in opts_result.scalars().all()}
            seen_opt_ids: set[int] = set()
            for opt_data in group_data.get("options", []):
                if not isinstance(opt_data, dict) or not opt_data.get("option_name"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Each modifier option must include a non-empty 'option_name' (group '{group_data['group_name']}')",
                    )
                oid = opt_data.get("id")
                option = existing_opts.get(oid) if oid else None
                if option is None:
                    option = MenuModifierOption(
                        modifier_group_id=group.id,
                        option_name=opt_data["option_name"],
                    )
                    db.add(option)
                    await db.flush()
                option.option_name = opt_data["option_name"]
                option.display_order = opt_data.get("display_order", 0)
                option.price_adjustment = opt_data.get("price_adjustment", 0)
                option.is_default = opt_data.get("is_default", False)
                option.is_available = opt_data.get("is_available", True)
                seen_opt_ids.add(option.id)

            for oid, opt in existing_opts.items():
                if oid not in seen_opt_ids:
                    await delete_translations(db, "menu_modifier_options", oid)
                    await db.delete(opt)

        for gid, grp in existing_groups.items():
            if gid not in seen_group_ids:
                opts = await db.execute(
                    select(MenuModifierOption).where(MenuModifierOption.modifier_group_id == gid)
                )
                for o in opts.scalars().all():
                    await delete_translations(db, "menu_modifier_options", o.id)
                    await db.delete(o)
                await delete_translations(db, "menu_modifier_groups", gid)
                await db.delete(grp)

    # Replace allergen_ids if provided
    if allergen_ids_data is not None:
        if allergen_ids_data:
            allergen_result = await db.execute(
                select(Allergen.id).where(
                    Allergen.id.in_(allergen_ids_data),
                    Allergen.deleted_at.is_(None),
                )
            )
            valid_allergen_ids = {row[0] for row in allergen_result.all()}
            invalid_allergen_ids = set(allergen_ids_data) - valid_allergen_ids
            if invalid_allergen_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid allergen IDs: {sorted(invalid_allergen_ids)}",
                )
        existing = await db.execute(
            select(MenuItemAllergen).where(MenuItemAllergen.menu_item_id == item.id)
        )
        for a in existing.scalars().all():
            await db.delete(a)
        for aid in allergen_ids_data:
            db.add(MenuItemAllergen(menu_item_id=item.id, allergen_id=aid))

    # Replace dietary_tag_ids if provided
    if dietary_tag_ids_data is not None:
        if dietary_tag_ids_data:
            tag_result = await db.execute(
                select(DietaryTag.id).where(
                    DietaryTag.id.in_(dietary_tag_ids_data),
                    DietaryTag.is_active.is_(True),
                )
            )
            valid_tag_ids = {row[0] for row in tag_result.all()}
            invalid_tag_ids = set(dietary_tag_ids_data) - valid_tag_ids
            if invalid_tag_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid dietary tag IDs: {sorted(invalid_tag_ids)}",
                )
        existing = await db.execute(
            select(MenuItemDietaryTag).where(MenuItemDietaryTag.menu_item_id == item.id)
        )
        for d in existing.scalars().all():
            await db.delete(d)
        for did in dietary_tag_ids_data:
            db.add(MenuItemDietaryTag(menu_item_id=item.id, dietary_tag_id=did))

    # Replace recipes if provided (payload already validated + deduped)
    if recipes_data is not None:
        existing = await db.execute(
            select(MenuItemRecipe).where(MenuItemRecipe.menu_item_id == item.id)
        )
        for r in existing.scalars().all():
            await db.delete(r)
        for r_data in recipes_data:
            db.add(MenuItemRecipe(menu_item_id=item.id, **r_data))

    await db.commit()
    await db.refresh(item)

    # Re-translate on update
    await auto_translate_record(db, "menu_items", item.id, {
        "item_name": item.item_name,
        "description": item.description or "",
        "long_description": item.long_description or "",
    })

    await _translate_item_modifiers(db, item.id)
    return APIResponse(data=await _build_menu_item_out(db, item))


@router.delete("/items/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete a menu item."""
    result = await db.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.modifier_groups).selectinload(MenuModifierGroup.options))
        .where(
            MenuItem.id == id,
            MenuItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")

    item.is_active = False
    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "menu_items", id)
    # Cascade delete modifier group and option translations
    for group in item.modifier_groups or []:
        await delete_translations(db, "menu_modifier_groups", group.id)
        for opt in group.options or []:
            await delete_translations(db, "menu_modifier_options", opt.id)
    return None


# ---------------------------------------------------------------------------
# Allergens
# ---------------------------------------------------------------------------

@router.get("/allergens", response_model=APIResponse[PaginatedResponse[AllergenOut]])
async def list_allergens(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List all allergens (excluding soft-deleted)."""
    total_result = await db.execute(select(func.count(Allergen.id)).where(Allergen.deleted_at.is_(None)))
    total = total_result.scalar() or 0
    result = await db.execute(
        select(Allergen)
        .where(Allergen.deleted_at.is_(None))
        .order_by(Allergen.display_name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    allergens = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[AllergenOut.model_validate(a) for a in allergens],
            total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/allergens/{id}", response_model=APIResponse[AllergenOut])
async def get_allergen(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(Allergen).where(Allergen.id == id, Allergen.deleted_at.is_(None)))
    a = res.scalar_one_or_none()
    if not a: raise HTTPException(status_code=404, detail="Allergen not found")
    return APIResponse(data=AllergenOut.model_validate(a))


@router.post(
    "/allergens",
    response_model=APIResponse[AllergenOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_allergen(
    db: DBDependency,
    admin: CurrentAdmin,
    data: AllergenCreate,
):
    """Create a new allergen."""
    dup = await db.execute(
        select(Allergen.id).where(
            Allergen.allergen_key == data.allergen_key,
            Allergen.deleted_at.is_(None),
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Allergen key '{data.allergen_key}' already exists")
    allergen = Allergen(**data.model_dump())
    db.add(allergen)
    await db.commit()
    await db.refresh(allergen)
    await auto_translate_record(db, "allergens", allergen.id, {"display_name": allergen.display_name, "description": allergen.description or ""})
    return APIResponse(data=AllergenOut.model_validate(allergen))


@router.patch("/allergens/{id}", response_model=APIResponse[AllergenOut])
async def update_allergen(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: AllergenUpdate,
):
    """Update an allergen."""
    result = await db.execute(
        select(Allergen).where(
            Allergen.id == id,
            Allergen.deleted_at.is_(None),
        )
    )
    allergen = result.scalar_one_or_none()
    if allergen is None:
        raise HTTPException(status_code=404, detail="Allergen not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(allergen, field, value)

    await db.commit()
    await db.refresh(allergen)
    await auto_translate_record(db, "allergens", allergen.id, {"display_name": allergen.display_name, "description": allergen.description or ""})
    return APIResponse(data=AllergenOut.model_validate(allergen))


@router.delete("/allergens/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allergen(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete an allergen."""
    result = await db.execute(
        select(Allergen).where(
            Allergen.id == id,
            Allergen.deleted_at.is_(None),
        )
    )
    allergen = result.scalar_one_or_none()
    if allergen is None:
        raise HTTPException(status_code=404, detail="Allergen not found")

    allergen.is_active = False
    allergen.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "allergens", id)
    return None


# ---------------------------------------------------------------------------
# Tax Categories
# ---------------------------------------------------------------------------

@router.get("/tax-categories", response_model=APIResponse[PaginatedResponse[TaxCategoryOut]])
async def list_tax_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List tax categories for a store (excluding soft-deleted)."""
    total_result = await db.execute(
        select(func.count(TaxCategory.id)).where(TaxCategory.deleted_at.is_(None))
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(TaxCategory)
        .where(TaxCategory.deleted_at.is_(None))
        .order_by(TaxCategory.category_name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    tax_categories = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[TaxCategoryOut.model_validate(t) for t in tax_categories],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/tax-categories/{id}", response_model=APIResponse[TaxCategoryOut])
async def get_tax_category(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(TaxCategory).where(TaxCategory.id == id, TaxCategory.deleted_at.is_(None)))
    t = res.scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="Tax category not found")
    return APIResponse(data=TaxCategoryOut.model_validate(t))


@router.post(
    "/tax-categories",
    response_model=APIResponse[TaxCategoryOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_tax_category(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TaxCategoryCreate,
):
    """Create a new tax category."""
    tax_category = TaxCategory(**data.model_dump())
    db.add(tax_category)
    await db.commit()
    await db.refresh(tax_category)
    await auto_translate_record(db, "tax_categories", tax_category.id, {"category_name": tax_category.category_name})
    return APIResponse(data=TaxCategoryOut.model_validate(tax_category))


@router.patch("/tax-categories/{id}", response_model=APIResponse[TaxCategoryOut])
async def update_tax_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: TaxCategoryUpdate,
):
    """Update a tax category."""
    result = await db.execute(
        select(TaxCategory).where(
            TaxCategory.id == id,
            TaxCategory.deleted_at.is_(None),
        )
    )
    tax_category = result.scalar_one_or_none()
    if tax_category is None:
        raise HTTPException(status_code=404, detail="Tax category not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tax_category, field, value)

    await db.commit()
    await db.refresh(tax_category)
    await auto_translate_record(db, "tax_categories", tax_category.id, {"category_name": tax_category.category_name})
    return APIResponse(data=TaxCategoryOut.model_validate(tax_category))


@router.delete("/tax-categories/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax_category(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete a tax category."""
    result = await db.execute(
        select(TaxCategory).where(
            TaxCategory.id == id,
            TaxCategory.deleted_at.is_(None),
        )
    )
    tax_category = result.scalar_one_or_none()
    if tax_category is None:
        raise HTTPException(status_code=404, detail="Tax category not found")

    tax_category.is_active = False
    tax_category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "tax_categories", id)
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _build_menu_item_out(db, item: MenuItem) -> MenuItemOut:
    """Build MenuItemOut with all relationships loaded."""
    # Category
    category = None
    if item.category_id:
        cat_result = await db.execute(
            select(MenuCategory).where(MenuCategory.id == item.category_id)
        )
        cat = cat_result.scalar_one_or_none()
        if cat:
            category = MenuCategoryOut.model_validate(cat)

    # Variants
    var_result = await db.execute(
        select(MenuVariant).where(MenuVariant.parent_item_id == item.id)
    )
    variants = [MenuVariantOut.model_validate(v) for v in var_result.scalars().all()]

    # Modifier groups + options
    mod_result = await db.execute(
        select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id == item.id)
    )
    modifier_groups = mod_result.scalars().all()
    group_ids = [g.id for g in modifier_groups]

    opt_result = await db.execute(
        select(MenuModifierOption).where(
            MenuModifierOption.modifier_group_id.in_(group_ids)
        )
    )
    options_map: dict[int, list[MenuModifierOption]] = {}
    for o in opt_result.scalars().all():
        options_map.setdefault(o.modifier_group_id, []).append(o)

    modifier_group_outs = []
    for g in modifier_groups:
        group_dict = {c: getattr(g, c) for c in g.__table__.columns.keys()}
        group_out = MenuModifierGroupOut.model_validate(group_dict)
        group_out.options = [
            MenuModifierOptionOut.model_validate(o) for o in options_map.get(g.id, [])
        ]
        modifier_group_outs.append(group_out)

    # Allergens
    allergen_links = await db.execute(
        select(MenuItemAllergen).where(MenuItemAllergen.menu_item_id == item.id)
    )
    allergen_ids = {a.allergen_id for a in allergen_links.scalars().all()}
    allergen_result = await db.execute(
        select(Allergen).where(Allergen.id.in_(allergen_ids))
    )
    allergens = [AllergenOut.model_validate(a) for a in allergen_result.scalars().all()]

    # Dietary Tags
    from app.models.menu import MenuItemDietaryTag, DietaryTag
    dt_links = await db.execute(
        select(MenuItemDietaryTag).where(MenuItemDietaryTag.menu_item_id == item.id)
    )
    dt_ids = {l.dietary_tag_id for l in dt_links.scalars().all()}
    dt_result = await db.execute(
        select(DietaryTag).where(DietaryTag.id.in_(dt_ids))
    ) if dt_ids else None
    dietary_tags_out = [
        {"id": t.id, "display_name": t.display_name, "icon": t.icon, "tag_key": t.tag_key}
        for t in (dt_result.scalars().all() if dt_result else [])
    ]

    # Recipes
    recipe_result = await db.execute(
        select(MenuItemRecipe).where(MenuItemRecipe.menu_item_id == item.id)
    )
    recipes = [MenuItemRecipeOut.model_validate(r) for r in recipe_result.scalars().all()]

    # Build output
    item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    item_dict["category"] = category
    item_dict["variants"] = variants
    item_dict["modifier_groups"] = modifier_group_outs
    item_dict["allergens"] = allergens
    item_dict["dietary_tags"] = dietary_tags_out
    item_dict["recipes"] = recipes

    return MenuItemOut.model_validate(item_dict)
