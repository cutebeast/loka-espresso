"""Admin menu management endpoints."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.menu import (
    Allergen,
    MenuCategory,
    MenuItem,
    MenuItemAllergen,
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
)

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


class MenuItemCreateRequest(MenuItemCreate):
    modifier_groups: list[_MenuModifierGroupInline] | None = None
    variants: list[_MenuVariantInline] | None = None
    allergen_ids: list[int] | None = None


class AllergenCreate(BaseSchema):
    allergen_key: str
    display_name: str
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] = "high"


class AllergenUpdate(BaseSchema):
    allergen_key: str | None = None
    display_name: str | None = None
    description: str | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None


class TaxCategoryCreate(BaseSchema):
    store_id: int
    category_name: str
    rate: float


class TaxCategoryUpdate(BaseSchema):
    category_name: str | None = None
    rate: float | None = None


class TaxCategoryOut(TimestampedSchema):
    id: int
    store_id: int
    category_name: str
    rate: float
    is_active: bool


# ---------------------------------------------------------------------------
# Menu Categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=APIResponse[list[MenuCategoryOut]])
async def list_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """List menu categories for a store (excluding soft-deleted)."""
    result = await db.execute(
        select(MenuCategory)
        .where(
            MenuCategory.store_id == store_id,
            MenuCategory.deleted_at.is_(None),
        )
        .order_by(MenuCategory.display_order)
    )
    categories = result.scalars().all()
    return APIResponse(
        data=[MenuCategoryOut.model_validate(c) for c in categories]
    )


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
    category = MenuCategory(**data.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
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

    category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Menu Items
# ---------------------------------------------------------------------------

@router.get("/items", response_model=APIResponse[PaginatedResponse[MenuItemOut]])
async def list_items(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    category_id: int | None = Query(None),
    is_available: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List menu items with optional filters and pagination."""
    base_stmt = select(MenuItem).where(
        MenuItem.store_id == store_id,
        MenuItem.deleted_at.is_(None),
    )
    if category_id is not None:
        base_stmt = base_stmt.where(MenuItem.category_id == category_id)
    if is_available is not None:
        base_stmt = base_stmt.where(MenuItem.is_available.is_(is_available))

    count_stmt = select(func.count(MenuItem.id)).where(
        MenuItem.store_id == store_id,
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

    item_outs = []
    for item in items:
        item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
        item_dict["category"] = category_map.get(item.category_id)
        item_dict["allergens"] = []
        item_dict["modifier_groups"] = []
        item_dict["variants"] = []
        item_dict["recipes"] = []
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
    item_data = data.model_dump(
        exclude={"modifier_groups", "variants", "allergen_ids"},
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

    await db.commit()
    await db.refresh(item)

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

    return APIResponse(data=await _build_menu_item_out(db, item))


@router.patch("/items/{id}", response_model=APIResponse[MenuItemOut])
async def update_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: MenuItemUpdate,
):
    """Update core fields of a menu item."""
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
    for field, value in update_data.items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return APIResponse(data=await _build_menu_item_out(db, item))


@router.delete("/items/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Soft-delete a menu item."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == id,
            MenuItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Menu item not found")

    item.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Allergens
# ---------------------------------------------------------------------------

@router.get("/allergens", response_model=APIResponse[list[AllergenOut]])
async def list_allergens(
    db: DBDependency,
    admin: CurrentAdmin,
):
    """List all allergens (excluding soft-deleted)."""
    result = await db.execute(
        select(Allergen)
        .where(Allergen.deleted_at.is_(None))
        .order_by(Allergen.display_name)
    )
    allergens = result.scalars().all()
    return APIResponse(
        data=[AllergenOut.model_validate(a) for a in allergens]
    )


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
    allergen = Allergen(**data.model_dump())
    db.add(allergen)
    await db.commit()
    await db.refresh(allergen)
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

    allergen.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Tax Categories
# ---------------------------------------------------------------------------

@router.get("/tax-categories", response_model=APIResponse[list[TaxCategoryOut]])
async def list_tax_categories(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """List tax categories for a store (excluding soft-deleted)."""
    result = await db.execute(
        select(TaxCategory)
        .where(
            TaxCategory.store_id == store_id,
            TaxCategory.deleted_at.is_(None),
        )
        .order_by(TaxCategory.category_name)
    )
    tax_categories = result.scalars().all()
    return APIResponse(
        data=[TaxCategoryOut.model_validate(t) for t in tax_categories]
    )


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

    tax_category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
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
        group_out = MenuModifierGroupOut.model_validate(g)
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

    # Build output
    item_dict = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    item_dict["category"] = category
    item_dict["variants"] = variants
    item_dict["modifier_groups"] = modifier_group_outs
    item_dict["allergens"] = allergens
    item_dict["recipes"] = []

    return MenuItemOut.model_validate(item_dict)
