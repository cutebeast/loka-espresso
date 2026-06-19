"""Admin bundle products endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.bundle_product import BundleProduct, BundleProductComponent, BundleComponentModifier
from app.models.menu import MenuCategory, MenuItem, MenuModifierOption
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.bundle_product import (
    BundleComponentModifierOut,
    BundleProductComponentIn,
    BundleProductComponentOut,
    BundleProductCreate,
    BundleProductOut,
    BundleProductUpdate,
)
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/menu/bundle-products", tags=["admin — bundle products"])

BUNDLE_CATEGORY_KEYS = {
    "combo": "bundle_combo",
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
        is_featured=True,
        display_order=0,
    )
    db.add(cat)
    await db.flush()
    return cat.id


def _validate_pick_x_component_pool(pick_count, allow_duplicates, components):
    if pick_count is not None and pick_count >= 1 and not allow_duplicates:
        if len(components) < pick_count:
            raise HTTPException(
                status_code=400,
                detail=f"Pick-X requires at least {pick_count} items in the pool. Only {len(components)} provided.",
            )


def _build_component_out(comp: BundleProductComponent) -> dict:
    item = comp.menu_item
    return {
        "id": comp.id,
        "menu_item_id": comp.menu_item_id,
        "menu_item_name": item.item_name if item else None,
        "menu_item_price": float(item.base_price) if item else None,
        "menu_item_image_url": item.image_url if item else None,
        "default_quantity": comp.default_quantity,
        "is_required": comp.is_required,
        "is_swappable": comp.is_swappable,
        "swap_group": comp.swap_group,
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


def _build_out(bp: BundleProduct) -> dict:
    cat_name = None
    if hasattr(bp, "category") and bp.category:
        cat_name = bp.category.category_name
    return {
        "id": bp.id,
        "bundle_type": bp.bundle_type,
        "title": bp.title,
        "description": bp.description,
        "image_url": bp.image_url,
        "bundle_price": float(bp.bundle_price),
        "category_id": bp.category_id,
        "category_name": cat_name,
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
        "components": [_build_component_out(c) for c in (bp.components or [])],
    }


@router.get("", response_model=APIResponse[list[dict]])
async def list_bundle_products(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
):
    base = select(BundleProduct).where(
        BundleProduct.deleted_at.is_(None)
    ).options(
        selectinload(BundleProduct.components).selectinload(BundleProductComponent.menu_item),
        selectinload(BundleProduct.components).selectinload(BundleProductComponent.modifier_overrides).selectinload(BundleComponentModifier.modifier_option),
    )
    cnt = select(func.count(BundleProduct.id)).where(BundleProduct.deleted_at.is_(None))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(BundleProduct.display_order.asc(), BundleProduct.id.desc()).offset((page - 1) * per_page).limit(per_page))
    items = [_build_out(bp) for bp in result.scalars().all()]
    return APIResponse(data=items)


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_bundle_product(db: DBDependency, admin: CurrentAdmin, data: BundleProductCreate):
    cat_id = data.category_id or await _get_or_create_bundle_category(db, data.bundle_type)

    bp = BundleProduct(
        bundle_type=data.bundle_type,
        title=data.title,
        description=data.description,
        image_url=data.image_url,
        bundle_price=data.bundle_price,
        category_id=cat_id,
        is_active=data.is_active,
        display_order=data.display_order,
        start_date=data.start_date,
        end_date=data.end_date,
        max_per_order=data.max_per_order,
        image_gallery_urls=data.image_gallery_urls,
        gallery_video_url=data.gallery_video_url,
        pick_count=data.pick_count,
        allow_duplicates=data.allow_duplicates,
    )

    _validate_pick_x_component_pool(data.pick_count, data.allow_duplicates, data.components)

    db.add(bp)
    await db.flush()

    for comp_in in data.components:
        comp = BundleProductComponent(
            bundle_product_id=bp.id,
            menu_item_id=comp_in.menu_item_id,
            default_quantity=comp_in.default_quantity,
            is_required=comp_in.is_required,
            is_swappable=comp_in.is_swappable,
            swap_group=comp_in.swap_group,
            sort_order=comp_in.sort_order,
        )
        db.add(comp)
        await db.flush()
        for mod_in in comp_in.modifier_overrides:
            mod = BundleComponentModifier(
                bundle_product_component_id=comp.id,
                modifier_option_id=mod_in.modifier_option_id,
                price_adjustment=mod_in.price_adjustment,
                is_default=mod_in.is_default,
            )
            db.add(mod)

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
            selectinload(BundleProduct.components)
        )
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Not found")

    update_data = data.model_dump(exclude_unset=True)
    components_data = update_data.pop("components", None)

    for field, value in update_data.items():
        setattr(bp, field, value)
    setattr(bp, "updated_at", datetime.now(timezone.utc))

    if components_data is not None:
        for existing in bp.components:
            await db.delete(existing)
        await db.flush()
        for comp_in in components_data:
            comp = BundleProductComponent(
                bundle_product_id=bp.id,
                menu_item_id=comp_in.menu_item_id,
                default_quantity=comp_in.default_quantity,
                is_required=comp_in.is_required,
                is_swappable=comp_in.is_swappable,
                swap_group=comp_in.swap_group,
                sort_order=comp_in.sort_order,
            )
            db.add(comp)
            await db.flush()
            for mod_in in comp_in.modifier_overrides:
                mod = BundleComponentModifier(
                    bundle_product_component_id=comp.id,
                    modifier_option_id=mod_in.modifier_option_id,
                    price_adjustment=mod_in.price_adjustment,
                    is_default=mod_in.is_default,
                )
                db.add(mod)

    _validate_pick_x_component_pool(
        getattr(bp, "pick_count", None),
        getattr(bp, "allow_duplicates", False),
        components_data if components_data is not None else [{"menu_item_id": c.menu_item_id} for c in bp.components],
    )

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
