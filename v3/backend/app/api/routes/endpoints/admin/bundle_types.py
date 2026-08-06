"""Bundle types admin endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.bundle_product import BundleType
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.bundle_product import BundleTypeCreate, BundleTypeUpdate
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/bundle-types", tags=["admin — bundle types"])


def _out(t: BundleType) -> dict:
    return {
        "id": t.id,
        "type_key": t.type_key,
        "name": t.name,
        "description": t.description,
        "mechanic": t.mechanic,
        "display_order": t.display_order,
        "is_active": t.is_active,
    }


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_bundle_types(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500)):
    filters = [BundleType.deleted_at.is_(None)]
    base = select(BundleType).where(*filters).order_by(BundleType.display_order, BundleType.id)
    total = (await db.execute(select(func.count()).select_from(BundleType).where(*filters))).scalar() or 0
    result = await db.execute(base.offset((page - 1) * per_page).limit(per_page))
    items = [_out(t) for t in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total + per_page - 1) // per_page if per_page else 0))


@router.get("/{id}", response_model=APIResponse[dict])
async def get_bundle_type(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(BundleType).where(BundleType.id == id, BundleType.deleted_at.is_(None)))
    t = res.scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="Bundle type not found")
    return APIResponse(data=_out(t))


@router.post("", response_model=APIResponse[dict])
async def create_bundle_type(db: DBDependency, admin: CurrentAdmin, data: BundleTypeCreate):
    dup = await db.execute(select(BundleType.id).where(BundleType.type_key == data.type_key, BundleType.deleted_at.is_(None)))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Type key '{data.type_key}' already exists")
    bundle_type = BundleType(**data.model_dump(exclude_unset=True))
    db.add(bundle_type)
    await db.commit()
    await db.refresh(bundle_type)
    await auto_translate_record(db, "bundle_types", bundle_type.id, {"name": bundle_type.name or "", "description": bundle_type.description or ""})
    return APIResponse(data=_out(bundle_type))


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_bundle_type(db: DBDependency, admin: CurrentAdmin, id: int, data: BundleTypeUpdate):
    result = await db.execute(select(BundleType).where(BundleType.id == id, BundleType.deleted_at.is_(None)))
    bundle_type = result.scalar_one_or_none()
    if not bundle_type: raise HTTPException(404, "Bundle type not found")
    update_data = data.model_dump(exclude_unset=True)
    new_key = update_data.get("type_key")
    if new_key and new_key != bundle_type.type_key:
        dup = await db.execute(select(BundleType.id).where(BundleType.type_key == new_key, BundleType.deleted_at.is_(None)))
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail=f"Type key '{new_key}' already exists")
    for field, value in update_data.items():
        setattr(bundle_type, field, value)
    await db.commit()
    await auto_translate_record(db, "bundle_types", id, {"name": bundle_type.name or "", "description": bundle_type.description or ""})
    return APIResponse(data=_out(bundle_type))


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_bundle_type(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(BundleType).where(BundleType.id == id, BundleType.deleted_at.is_(None)))
    bundle_type = result.scalar_one_or_none()
    if not bundle_type: raise HTTPException(404, "Bundle type not found")
    bundle_type.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "bundle_types", id)
    return APIResponse(data={"id": id, "deleted": True})
