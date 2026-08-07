"""Bundle categories admin endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.bundle_product import BundleCategory
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.bundle_product import BundleCategoryCreate, BundleCategoryUpdate
from app.services.translation import auto_translate_record, schedule_auto_translate, delete_translations

router = APIRouter(prefix="/admin/bundle-categories", tags=["admin — bundle categories"])


def _out(c: BundleCategory) -> dict:
    return {"id": c.id, "name": c.name, "slug": c.slug, "display_order": c.display_order, "is_active": c.is_active}


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_categories(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500)):
    filters = [BundleCategory.deleted_at.is_(None)]
    base = select(BundleCategory).where(*filters).order_by(BundleCategory.display_order, BundleCategory.id)
    total = (await db.execute(select(func.count()).select_from(BundleCategory).where(*filters))).scalar() or 0
    result = await db.execute(base.offset((page - 1) * per_page).limit(per_page))
    items = [_out(c) for c in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total + per_page - 1) // per_page if per_page else 0))


@router.get("/{id}", response_model=APIResponse[dict])
async def get_category(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(BundleCategory).where(BundleCategory.id == id, BundleCategory.deleted_at.is_(None)))
    c = res.scalar_one_or_none()
    if not c: raise HTTPException(status_code=404, detail="Category not found")
    return APIResponse(data=_out(c))


@router.post("", response_model=APIResponse[dict])
async def create_category(db: DBDependency, admin: CurrentAdmin, data: BundleCategoryCreate):
    dup = await db.execute(select(BundleCategory.id).where(BundleCategory.slug == data.slug, BundleCategory.deleted_at.is_(None)))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Category slug '{data.slug}' already exists")
    category = BundleCategory(**data.model_dump(exclude_unset=True))
    db.add(category)
    await db.commit()
    await db.refresh(category)
    schedule_auto_translate("bundle_categories", category.id, {"name": category.name})
    return APIResponse(data=_out(category))


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_category(db: DBDependency, admin: CurrentAdmin, id: int, data: BundleCategoryUpdate):
    result = await db.execute(select(BundleCategory).where(BundleCategory.id == id, BundleCategory.deleted_at.is_(None)))
    category = result.scalar_one_or_none()
    if not category: raise HTTPException(404, "Category not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
    await db.commit()
    schedule_auto_translate("bundle_categories", id, {"name": category.name or ""})
    return APIResponse(data=_out(category))


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_category(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(BundleCategory).where(BundleCategory.id == id, BundleCategory.deleted_at.is_(None)))
    category = result.scalar_one_or_none()
    if not category: raise HTTPException(404, "Category not found")
    category.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "bundle_categories", id)
    return APIResponse(data={"id": id, "deleted": True})
