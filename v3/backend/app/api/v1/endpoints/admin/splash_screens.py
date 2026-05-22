"""Admin splash screens endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.info_card import SplashScreen
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.content import SplashScreenCreate, SplashScreenUpdate
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/content/splash-screens", tags=["admin — splash screens"])


@router.get("", response_model=APIResponse[PaginatedResponse[dict]])
async def list_items(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=100)):
    base = select(SplashScreen).where(SplashScreen.deleted_at.is_(None))
    cnt = select(func.count(SplashScreen.id)).where(SplashScreen.deleted_at.is_(None))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(SplashScreen.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = []
    for r in result.scalars().all():
        d = {}
        for c in r.__table__.columns.keys():
            v = getattr(r, c)
            if isinstance(v, datetime): d[c] = v.isoformat()
            else: d[c] = v
        items.append(d)
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))

@router.get("/{id}", response_model=APIResponse[dict])
async def get_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(SplashScreen).where(SplashScreen.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    d = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    for k in ["created_at","updated_at","active_from","active_until"]:
        if getattr(item, k): d[k] = getattr(item, k).isoformat()
    return APIResponse(data=d)

@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_item(db: DBDependency, admin: CurrentAdmin, data: SplashScreenCreate):
    item = SplashScreen(**data.model_dump(exclude_unset=True))
    db.add(item); await db.commit();
    await auto_translate_record(db, "splash_screens", item.id, {"title": data.title or "", "subtitle": data.subtitle or ""})
    await db.refresh(item)
    return APIResponse(data={"id": item.id, "message": "Created"})

@router.patch("/{id}", response_model=APIResponse[dict])
async def update_item(db: DBDependency, admin: CurrentAdmin, id: int, data: SplashScreenUpdate):
    result = await db.execute(select(SplashScreen).where(SplashScreen.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    setattr(item, "updated_at", datetime.now(timezone.utc))
    await db.commit()
    await auto_translate_record(db, "splash_screens", item.id, {"title": item.title or "", "subtitle": item.subtitle or ""})
    return APIResponse(data={"id": item.id, "message": "Updated"})

@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(SplashScreen).where(SplashScreen.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    await db.delete(item); await db.commit()
    await delete_translations(db, "splash_screens", id)
    return APIResponse(data={"id": id, "deleted": True})
