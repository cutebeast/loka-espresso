"""Public menu endpoints (no auth required)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import DBDependency, OptionalLocale
from app.services.translation import translate_menu_response, translate_single
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
from app.models.bundle_product import BundleProduct, BundleProductComponent, BundleComponentModifier, BundleGroup
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


def _is_category_available_now(cat: MenuCategory, now_time, now_date) -> bool:
    """Check if a category is available based on time-of-day and date windows."""
    # Time-of-day window (e.g. breakfast 05:00-09:00)
    if cat.available_from_time is not None and now_time < cat.available_from_time:
        return False
    if cat.available_to_time is not None and now_time > cat.available_to_time:
        return False
    # Seasonal date window (e.g. Christmas combo Dec 1-31)
    if cat.available_from_date is not None and now_date < cat.available_from_date:
        return False
    if cat.available_to_date is not None and now_date > cat.available_to_date:
        return False
    return True


def _build_comp_entry(comp: BundleProductComponent) -> dict:
    item = comp.menu_item
    return {
        "id": comp.id,
        "menu_item_id": comp.menu_item_id,
        "bundle_group_id": comp.bundle_group_id,
        "menu_item_name": item.item_name if item else None,
        "menu_item_price": float(item.base_price) if item else None,
        "menu_item_image_url": item.image_url if item else None,
        "default_quantity": comp.default_quantity,
        "sort_order": comp.sort_order,
        "modifier_overrides": [
            {
                "id": mo.id,
                "modifier_option_id": mo.modifier_option_id,
                "modifier_option_name": mo.modifier_option.option_name if mo.modifier_option else None,
                "price_adjustment": float(mo.price_adjustment) if mo.price_adjustment is not None else None,
                "is_default": mo.is_default,
            }
            for mo in (comp.modifier_overrides or [])
        ],
    }


def _component_available(comp: BundleProductComponent) -> bool:
    """Return True if the component's menu item is present and sellable."""
    item = comp.menu_item
    return item is not None and item.is_available and item.deleted_at is None


@router.get("/stores/{store_id}", response_model=APIResponse[MenuPublicOut])
async def get_store_menu(
    db: DBDependency,
    locale: OptionalLocale,
    store_id: int,
    category_id: int | None = Query(None),
    search: str | None = Query(None, max_length=100),
    is_featured: bool | None = Query(None),
):
    """Get full public menu for a store."""
    # Fetch categories (global menu, not per-store)
    now = datetime.now(timezone.utc)
    now_time = now.time()
    now_date = now.date()
    cat_stmt = select(MenuCategory).where(
        MenuCategory.is_available.is_(True),
        MenuCategory.deleted_at.is_(None),
    ).order_by(
        # Combo categories first, then by display_order
        (MenuCategory.category_type != "combo"),
        MenuCategory.display_order,
        MenuCategory.id,
    )
    cat_result = await db.execute(cat_stmt)
    all_categories = cat_result.scalars().all()
    # Filter out categories outside their time/date availability window
    categories = [
        c for c in all_categories
        if _is_category_available_now(c, now_time, now_date)
    ]

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

    # Fetch active bundle products (global or scoped to this store)
    now = datetime.now(timezone.utc)
    bp_result = await db.execute(
        select(BundleProduct).where(
            BundleProduct.is_active.is_(True),
            BundleProduct.deleted_at.is_(None),
            (BundleProduct.start_date.is_(None)) | (BundleProduct.start_date <= now),
            (BundleProduct.end_date.is_(None)) | (BundleProduct.end_date >= now),
            (BundleProduct.store_id.is_(None)) | (BundleProduct.store_id == store_id),
        ).options(
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
        ).order_by(BundleProduct.display_order.asc(), BundleProduct.id.desc())
    )
    bundle_products_out = []
    for bp in bp_result.scalars().all():
        groups_dict = {}
        standalone_components = []
        for comp in (bp.components or []):
            if not _component_available(comp):
                continue
            if comp.bundle_group_id and bp.groups:
                groups_dict.setdefault(comp.bundle_group_id, []).append(comp)
            else:
                standalone_components.append(comp)

        groups_out = []
        for group in sorted(bp.groups or [], key=lambda g: g.sort_order):
            group_comps = groups_dict.get(group.id, [])
            groups_out.append({
                "id": group.id,
                "group_label": group.group_label,
                "group_description": group.group_description,
                "pick_count": group.pick_count,
                "min_pick": group.min_pick,
                "max_pick": group.max_pick,
                "sort_order": group.sort_order,
                "components": [
                    _build_comp_entry(comp) for comp in sorted(group_comps, key=lambda c: c.sort_order)
                ],
            })

        all_components = [c for g in groups_out for c in g["components"]] + [
            _build_comp_entry(comp) for comp in sorted(standalone_components, key=lambda c: c.sort_order)
        ]

        # Hide bundles with no available components so customers cannot order
        # incomplete/unavailable combos. For multi-course bundles, also hide if
        # any group has no available components.
        if not all_components:
            continue
        if bp.groups and any(not groups_dict.get(group.id) for group in bp.groups):
            continue

        bp_d = {
            "id": bp.id,
            "bundle_type": bp.bundle_type,
            "title": bp.title,
            "description": bp.description,
            "image_url": bp.image_url,
            "bundle_price": float(bp.bundle_price),
            "category_id": bp.category_id,
            "display_order": bp.display_order,
            "pick_count": bp.pick_count,
            "allow_duplicates": bp.allow_duplicates,
            "max_per_order": bp.max_per_order,
            "components": all_components,
            "groups": groups_out,
        }
        bundle_products_out.append(bp_d)

    menu_data = MenuPublicOut(
        store_id=store_id,
        categories=cat_outs,
        items=item_outs,
        bundle_products=bundle_products_out,
    ).model_dump()

    await translate_menu_response(db, menu_data, locale)

    return APIResponse(data=menu_data)


@router.get("/items", response_model=APIResponse[dict])
async def list_menu_items(
    db: DBDependency,
    locale: OptionalLocale,
    is_featured: bool | None = Query(None),
    category_id: int | None = Query(None),
    search: str | None = Query(None, max_length=100),
    available_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
):
    """List global menu items (no store_id required — menu is global)."""
    item_stmt = select(MenuItem).where(
        MenuItem.is_available.is_(True),
        MenuItem.deleted_at.is_(None),
    )
    if category_id:
        item_stmt = item_stmt.where(MenuItem.category_id == category_id)
    if is_featured is not None:
        item_stmt = item_stmt.where(MenuItem.is_featured.is_(is_featured))
    if search:
        item_stmt = item_stmt.where(
            MenuItem.item_name.ilike(f"%{search}%")
            | MenuItem.description.ilike(f"%{search}%")
        )
    if available_only:
        item_stmt = item_stmt.where(MenuItem.is_available.is_(True))

    item_stmt = item_stmt.order_by(MenuItem.item_name).limit(limit)
    item_result = await db.execute(item_stmt)
    items = item_result.scalars().all()

    result_items = []
    for i in items:
        d = {c.name: getattr(i, c.name) for c in i.__table__.columns}
        d["dietary_tags"] = None
        d["allergens"] = []
        result_items.append(d)

    return APIResponse(data={"items": result_items})


@router.get("/categories", response_model=APIResponse[dict])
async def list_menu_categories(db: DBDependency, locale: OptionalLocale):
    """List global menu categories (no store_id required)."""
    now_dt = datetime.now(timezone.utc)
    now_time = now_dt.time()
    now_date = now_dt.date()
    cat_stmt = select(MenuCategory).where(
        MenuCategory.is_available.is_(True),
        MenuCategory.deleted_at.is_(None),
    ).order_by(
        (MenuCategory.category_type != "combo"),
        MenuCategory.display_order,
        MenuCategory.id,
    )
    cat_result = await db.execute(cat_stmt)
    all_cats = cat_result.scalars().all()
    result = []
    for c in all_cats:
        if not _is_category_available_now(c, now_time, now_date):
            continue
        d = {col.name: getattr(c, col.name) for col in c.__table__.columns}
        result.append(d)
    return APIResponse(data={"categories": result})


@router.get("/items/{item_id}", response_model=APIResponse[MenuItemPublicOut])
async def get_menu_item(db: DBDependency, locale: OptionalLocale, item_id: int):
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
    item_dict["variants"] = [v.model_dump() for v in variants]
    item_dict["modifier_groups"] = [mg.model_dump() for mg in modifier_outs]
    item_dict["allergens"] = [a.model_dump() for a in allergen_outs]
    item_dict["dietary_tags"] = dietary_tags

    await translate_single(db, item_dict, "menu_items", locale)

    return APIResponse(data=item_dict)


@router.get("/bundle-products", response_model=APIResponse[list[dict]])
async def list_bundle_products_public(
    db: DBDependency,
    locale: OptionalLocale,
    store_id: int | None = Query(None),
):
    """List active bundle products for PWA menu display."""
    now = datetime.now(timezone.utc)
    filters = [
        BundleProduct.is_active.is_(True),
        BundleProduct.deleted_at.is_(None),
        (BundleProduct.start_date.is_(None)) | (BundleProduct.start_date <= now),
        (BundleProduct.end_date.is_(None)) | (BundleProduct.end_date >= now),
    ]
    if store_id is not None:
        filters.append((BundleProduct.store_id.is_(None)) | (BundleProduct.store_id == store_id))
    result = await db.execute(
        select(BundleProduct).where(*filters).options(
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
        ).order_by(BundleProduct.display_order.asc(), BundleProduct.id.desc())
    )
    items = []
    for bp in result.scalars().all():
        groups_dict = {}
        standalone_components = []
        for comp in (bp.components or []):
            if not _component_available(comp):
                continue
            if comp.bundle_group_id and bp.groups:
                groups_dict.setdefault(comp.bundle_group_id, []).append(comp)
            else:
                standalone_components.append(comp)

        groups_out = []
        for group in sorted(bp.groups or [], key=lambda g: g.sort_order):
            group_comps = groups_dict.get(group.id, [])
            groups_out.append({
                "id": group.id,
                "group_label": group.group_label,
                "group_description": group.group_description,
                "pick_count": group.pick_count,
                "min_pick": group.min_pick,
                "max_pick": group.max_pick,
                "sort_order": group.sort_order,
                "components": [
                    _build_comp_entry(comp) for comp in sorted(group_comps, key=lambda c: c.sort_order)
                ],
            })

        all_components = [c for g in groups_out for c in g["components"]] + [
            _build_comp_entry(comp) for comp in sorted(standalone_components, key=lambda c: c.sort_order)
        ]

        if not all_components:
            continue
        if bp.groups and any(not groups_dict.get(group.id) for group in bp.groups):
            continue

        bp_d = {
            "id": bp.id,
            "bundle_type": bp.bundle_type,
            "title": bp.title,
            "description": bp.description,
            "image_url": bp.image_url,
            "bundle_price": float(bp.bundle_price),
            "category_id": bp.category_id,
            "display_order": bp.display_order,
            "pick_count": bp.pick_count,
            "allow_duplicates": bp.allow_duplicates,
            "max_per_order": bp.max_per_order,
            "components": all_components,
            "groups": groups_out,
        }
        items.append(bp_d)
    return APIResponse(data=items)
