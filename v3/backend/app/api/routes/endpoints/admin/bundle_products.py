"""Admin bundle products endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.bundle_product import BundleProduct, BundleProductComponent, BundleComponentModifier, BundleGroup
from app.models.menu import MenuCategory, MenuItem, MenuModifierOption
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.bundle_product import (
    BundleComponentModifierOut,
    BundleProductComponentIn,
    BundleProductComponentOut,
    BundleProductCreate,
    BundleProductOut,
    BundleProductUpdate,
    BundleGroupIn,
)
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/menu/bundle-products", tags=["admin — bundle products"])

BUNDLE_CATEGORY_KEYS = {
    "combo": "bundle_combo",
    "value_meal": "bundle_combo",
    "family_meal": "bundle_combo",
    "breakfast_set": "bundle_combo",
    "promotional": "bundle_combo",
    "pick_x": "bundle_combo",
    "multi_course": "bundle_combo",
}


async def _get_or_create_bundle_category(db, bundle_type: str) -> int | None:
    category_key = BUNDLE_CATEGORY_KEYS.get(bundle_type)
    if not category_key:
        return None
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.slug == category_key)
    )
    cat = result.scalar_one_or_none()
    if cat:
        return cat.id
    cat = MenuCategory(
        category_name="Combo",
        slug=category_key,
        description="Combo meal bundles",
        is_available=True,
        is_featured=False,
        category_type="combo",
        display_order=99,
    )
    db.add(cat)
    await db.flush()
    return cat.id


def _build_component_out(comp: BundleProductComponent) -> dict:
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


def _build_group_out(group: BundleGroup) -> dict:
    return {
        "id": group.id,
        "group_label": group.group_label,
        "group_description": group.group_description,
        "pick_count": group.pick_count,
        "min_pick": group.min_pick,
        "max_pick": group.max_pick,
        "sort_order": group.sort_order,
        "components": [
            _build_component_out(c)
            for c in sorted((group.components or []), key=lambda c: c.sort_order)
        ],
    }


def _build_out(bp: BundleProduct) -> dict:
    cat_name = None
    if hasattr(bp, "category") and bp.category:
        cat_name = bp.category.category_name

    groups_dict = {}
    standalone_components = []
    for c in (bp.components or []):
        if c.bundle_group_id and hasattr(bp, "groups") and bp.groups:
            groups_dict.setdefault(c.bundle_group_id, []).append(c)
        else:
            standalone_components.append(c)

    groups_out = []
    if hasattr(bp, "groups"):
        for group in sorted(bp.groups, key=lambda g: g.sort_order):
            groups_out.append({
                "id": group.id,
                "group_label": group.group_label,
                "group_description": group.group_description,
                "pick_count": group.pick_count,
                "min_pick": group.min_pick,
                "max_pick": group.max_pick,
                "sort_order": group.sort_order,
                "components": [
                    _build_component_out(c)
                    for c in sorted(groups_dict.get(group.id, []), key=lambda c: c.sort_order)
                ],
            })

    all_components = [c for g in groups_out for c in g["components"]] + [
        _build_component_out(c) for c in sorted(standalone_components, key=lambda c: c.sort_order)
    ]

    return {
        "id": bp.id,
        "bundle_type": bp.bundle_type,
        "title": bp.title,
        "description": bp.description,
        "image_url": bp.image_url,
        "bundle_price": float(bp.bundle_price),
        "category_id": bp.category_id,
        "category_name": cat_name,
        "store_id": bp.store_id,
        "is_active": bp.is_active,
        "display_order": bp.display_order,
        "start_date": bp.start_date.isoformat() if bp.start_date else None,
        "end_date": bp.end_date.isoformat() if bp.end_date else None,
        "max_per_order": bp.max_per_order,
        "image_gallery_urls": bp.image_gallery_urls,
        "gallery_video_url": bp.gallery_video_url,
        "created_at": bp.created_at.isoformat() if bp.created_at else None,
        "updated_at": bp.updated_at.isoformat() if bp.updated_at else None,
        "deleted_at": bp.deleted_at.isoformat() if bp.deleted_at else None,
        "pick_count": bp.pick_count,
        "allow_duplicates": bp.allow_duplicates,
        "components": all_components,
        "groups": groups_out,
    }


async def _validate_bundle_component_items(db, components_data: list):
    """Ensure every component points to an active, non-deleted menu item."""
    if not components_data:
        return
    menu_item_ids = {c["menu_item_id"] for c in components_data if isinstance(c, dict) and c.get("menu_item_id")}
    if not menu_item_ids:
        menu_item_ids = {c.menu_item_id for c in components_data if hasattr(c, "menu_item_id")}
    if not menu_item_ids:
        return

    result = await db.execute(
        select(MenuItem).where(MenuItem.id.in_(menu_item_ids))
    )
    items = {item.id: item for item in result.scalars().all()}
    missing = []
    unavailable = []
    for mid in menu_item_ids:
        item = items.get(mid)
        if item is None:
            missing.append(mid)
        elif not item.is_available or item.deleted_at is not None:
            unavailable.append(mid)
    if missing:
        raise HTTPException(status_code=400, detail=f"Menu items not found: {missing}")
    if unavailable:
        raise HTTPException(status_code=400, detail=f"Menu items unavailable or deleted: {unavailable}")


async def _create_components(
    db,
    bp_id: int,
    components_data: list,
    group_map: dict[int | str, int] | None = None,
):
    for comp_in_data in components_data:
        comp_in = BundleProductComponentIn(**comp_in_data) if isinstance(comp_in_data, dict) else comp_in_data
        group_id = None
        if group_map is not None and comp_in.bundle_group_id is not None:
            group_id = group_map.get(comp_in.bundle_group_id)
        comp = BundleProductComponent(
            bundle_product_id=bp_id,
            bundle_group_id=group_id,
            menu_item_id=comp_in.menu_item_id,
            default_quantity=comp_in.default_quantity,
            sort_order=comp_in.sort_order,
        )
        db.add(comp)
        await db.flush()
        for mod_in in (comp_in.modifier_overrides or []):
            mod = BundleComponentModifier(
                bundle_product_component_id=comp.id,
                modifier_option_id=mod_in.modifier_option_id,
                price_adjustment=mod_in.price_adjustment,
                is_default=mod_in.is_default,
            )
            db.add(mod)


async def _create_groups(db, bp_id: int, groups_data: list, components_data_all: list) -> dict[int | str, int]:
    group_map: dict[int | str, int] = {}
    seen_sort_orders = set()
    seen_client_ids = set()
    for gi_in_data in groups_data:
        gi = gi_in_data if isinstance(gi_in_data, dict) else gi_in_data.model_dump()
        sort_order = gi.get("sort_order", 0)
        client_id = gi.get("client_id")
        if sort_order in seen_sort_orders:
            raise HTTPException(status_code=400, detail=f"Duplicate group sort_order: {sort_order}")
        if client_id is not None and client_id in seen_client_ids:
            raise HTTPException(status_code=400, detail=f"Duplicate group client_id: {client_id}")
        seen_sort_orders.add(sort_order)
        if client_id is not None:
            seen_client_ids.add(client_id)

        group = BundleGroup(
            bundle_product_id=bp_id,
            group_label=gi.get("group_label", f"Group {sort_order + 1}"),
            group_description=gi.get("group_description"),
            pick_count=gi.get("pick_count", 1),
            min_pick=gi.get("min_pick", gi.get("pick_count", 1)),
            max_pick=gi.get("max_pick", gi.get("pick_count", 1)),
            sort_order=sort_order,
        )
        db.add(group)
        await db.flush()
        group_map[sort_order] = group.id
        if client_id is not None:
            group_map[client_id] = group.id
    return group_map


@router.get("", response_model=APIResponse[list[dict]])
async def list_bundle_products(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    store_id: int | None = Query(None),
):
    filters = [BundleProduct.deleted_at.is_(None)]
    if store_id is not None:
        filters.append(
            (BundleProduct.store_id.is_(None)) | (BundleProduct.store_id == store_id)
        )
    base = select(BundleProduct).where(*filters).options(
        selectinload(BundleProduct.components).selectinload(BundleProductComponent.menu_item),
        selectinload(BundleProduct.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
        selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.menu_item),
        selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
    )
    cnt = select(func.count(BundleProduct.id)).where(*filters)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(BundleProduct.display_order.asc(), BundleProduct.id.desc()).offset((page - 1) * per_page).limit(per_page))
    items = [_build_out(bp) for bp in result.scalars().all()]
    return APIResponse(data=items)


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_bundle_product(db: DBDependency, admin: CurrentAdmin, data: BundleProductCreate):
    cat_id = data.category_id or await _get_or_create_bundle_category(db, data.bundle_type)

    if data.bundle_type in ("pick_x",):
        if not data.pick_count or data.pick_count < 1:
            raise HTTPException(status_code=400, detail="Pick count must be at least 1 for Pick & Choose bundles")
        if not data.allow_duplicates and len(data.components) < data.pick_count:
            raise HTTPException(status_code=400, detail=f"Pick-X requires at least {data.pick_count} items in the pool")

    if data.bundle_type == "multi_course":
        if not data.groups:
            raise HTTPException(status_code=400, detail="Multi-course bundles require at least one group")
        for g in data.groups:
            if not g.pick_count or g.pick_count < 1:
                raise HTTPException(status_code=400, detail=f"Group '{g.group_label}' needs a pick count >= 1")

    await _validate_bundle_component_items(db, data.components)

    bp = BundleProduct(
        bundle_type=data.bundle_type,
        title=data.title,
        description=data.description,
        image_url=data.image_url,
        bundle_price=data.bundle_price,
        category_id=cat_id,
        store_id=data.store_id,
        is_active=data.is_active,
        display_order=data.display_order,
        start_date=data.start_date,
        end_date=data.end_date,
        max_per_order=data.max_per_order,
        image_gallery_urls=data.image_gallery_urls,
        gallery_video_url=data.gallery_video_url,
        pick_count=data.pick_count if data.bundle_type == "pick_x" else None,
        allow_duplicates=data.allow_duplicates if data.bundle_type == "pick_x" else False,
    )

    db.add(bp)
    await db.flush()

    if data.bundle_type == "multi_course" and data.groups:
        group_map = await _create_groups(db, bp.id, data.groups, data.components)
    else:
        group_map = {}

    await _create_components(db, bp.id, data.components, group_map if data.bundle_type == "multi_course" else None)

    await db.commit()
    await auto_translate_record(db, "bundle_products", bp.id, {"title": bp.title or "", "description": bp.description or ""})
    await db.refresh(bp)
    return APIResponse(data={"id": bp.id, "message": "Created"})


@router.get("/{id}", response_model=APIResponse[dict])
async def get_bundle_product(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(
        select(BundleProduct).where(BundleProduct.id == id, BundleProduct.deleted_at.is_(None)).options(
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.menu_item),
            selectinload(BundleProduct.groups).selectinload(BundleGroup.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
        )
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Not found")
    return APIResponse(data=_build_out(bp))


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_bundle_product(db: DBDependency, admin: CurrentAdmin, id: int, data: BundleProductUpdate):
    result = await db.execute(
        select(BundleProduct).where(BundleProduct.id == id, BundleProduct.deleted_at.is_(None)).options(
            selectinload(BundleProduct.components),
            selectinload(BundleProduct.groups),
        )
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Not found")

    update_data = data.model_dump(exclude_unset=True)
    components_data = update_data.pop("components", None)
    groups_data = update_data.pop("groups", None)

    if groups_data is not None and components_data is None:
        raise HTTPException(
            status_code=400,
            detail="components must be provided when groups are updated",
        )

    for field, value in update_data.items():
        setattr(bp, field, value)
    setattr(bp, "updated_at", datetime.now(timezone.utc))

    if groups_data is not None:
        for existing_group in bp.groups:
            await db.delete(existing_group)
        await db.flush()

    if components_data is not None:
        for existing_comp in bp.components:
            await db.delete(existing_comp)
        await db.flush()

    if components_data is not None:
        await _validate_bundle_component_items(db, components_data)

    bp_type = getattr(bp, "bundle_type", "combo")

    # Validate Pick-X constraints (same as create)
    if bp_type == "pick_x":
        pc = getattr(bp, "pick_count", None)
        if pc and pc > 0:
            comp_count = len(components_data) if components_data is not None else len(bp.components)
            if not getattr(bp, "allow_duplicates", False) and comp_count < pc:
                raise HTTPException(status_code=400, detail=f"Pick-X requires at least {pc} items in the pool")
    if bp_type == "multi_course" and groups_data:
        for g_item in groups_data:
            g = g_item if isinstance(g_item, dict) else g_item.model_dump()
            if not g.get("pick_count") or g.get("pick_count", 0) < 1:
                raise HTTPException(status_code=400, detail=f"Group '{g.get('group_label', 'Unnamed')}' needs a pick count >= 1")

    if bp_type == "multi_course" and groups_data:
        group_map = await _create_groups(db, bp.id, groups_data, components_data or [])
    else:
        group_map = {}

    if components_data is not None:
        await _create_components(db, bp.id, components_data, group_map if bp_type == "multi_course" else None)

    await db.commit()
    await auto_translate_record(db, "bundle_products", bp.id, {"title": bp.title or "", "description": bp.description or ""})
    return APIResponse(data={"id": bp.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_bundle_product(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(
        select(BundleProduct).where(BundleProduct.id == id, BundleProduct.deleted_at.is_(None))
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Not found")
    bp.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "bundle_products", id)
    return APIResponse(data={"id": id, "deleted": True})
