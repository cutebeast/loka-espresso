"""Dietary tags admin endpoint."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.menu import DietaryTag, MenuItemDietaryTag
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.menu import DietaryTagCreate, DietaryTagUpdate
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/dietary-tags", tags=["admin — dietary tags"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_tags(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=100)):
    base = select(DietaryTag).order_by(DietaryTag.display_name)
    total = (await db.execute(select(func.count()).select_from(DietaryTag))).scalar() or 0
    result = await db.execute(base.offset((page - 1) * per_page).limit(per_page))
    items = [{"id": t.id, "tag_key": t.tag_key, "display_name": t.display_name, "icon": t.icon, "is_active": t.is_active} for t in result.scalars().all()]
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total + per_page - 1) // per_page if per_page else 0))


@router.get("/{id}", response_model=APIResponse[dict])
async def get_tag(db: DBDependency, admin: CurrentAdmin, id: int):
    res = await db.execute(select(DietaryTag).where(DietaryTag.id == id))
    t = res.scalar_one_or_none()
    if not t: raise HTTPException(status_code=404, detail="Tag not found")
    return APIResponse(data={"id": t.id, "tag_key": t.tag_key, "display_name": t.display_name, "icon": t.icon, "is_active": t.is_active})


@router.post("", response_model=APIResponse[dict])
async def create_tag(db: DBDependency, admin: CurrentAdmin, data: DietaryTagCreate):
    tag = DietaryTag(**data.model_dump(exclude_unset=True))
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    await auto_translate_record(db, "dietary_tags", tag.id, {"display_name": tag.display_name})
    return APIResponse(data={"id": tag.id, "tag_key": tag.tag_key, "display_name": tag.display_name})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_tag(db: DBDependency, admin: CurrentAdmin, id: int, data: DietaryTagUpdate):
    result = await db.execute(select(DietaryTag).where(DietaryTag.id == id))
    tag = result.scalar_one_or_none()
    if not tag: raise HTTPException(404, "Tag not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tag, field, value)
    await db.commit()
    await auto_translate_record(db, "dietary_tags", id, {"display_name": data.display_name or ""})
    return APIResponse(data={"id": tag.id, "display_name": tag.display_name, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_tag(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(DietaryTag).where(DietaryTag.id == id))
    tag = result.scalar_one_or_none()
    if not tag: raise HTTPException(404, "Tag not found")
    await db.delete(tag)
    await db.commit()
    await delete_translations(db, "dietary_tags", id)
    return APIResponse(data={"id": id, "deleted": True})
