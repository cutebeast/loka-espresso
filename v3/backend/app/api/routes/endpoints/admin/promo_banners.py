"""Admin promo banners endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.info_card import PromoBanner
from app.schemas.content import PromoBannerCreate, PromoBannerOut, PromoBannerUpdate
from app.schemas.base import APIResponse, PaginatedResponse
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/promo-banners", tags=["admin — promo banners"])


@router.get("", response_model=APIResponse[PaginatedResponse[PromoBannerOut]])
async def list_items(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500)):
    base = select(PromoBanner).options(selectinload(PromoBanner.voucher), selectinload(PromoBanner.survey))
    cnt = select(func.count(PromoBanner.id))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(PromoBanner.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = []
    for r in result.scalars().all():
        d = {}
        for c in r.__table__.columns.keys():
            v = getattr(r, c)
            if isinstance(v, datetime): d[c] = v.isoformat()
            else: d[c] = v
        d["voucher_display_title"] = r.voucher.display_title if r.voucher else None
        d["survey_name"] = r.survey.survey_name if r.survey else None
        items.append(d)
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_item(db: DBDependency, admin: CurrentAdmin, data: PromoBannerCreate):
    item = PromoBanner(**data.model_dump(exclude_unset=True))
    db.add(item); await db.commit();
    await auto_translate_record(db, "promo_banners", item.id, {"title": item.title or "", "short_description": item.short_description or ""})
    await db.refresh(item)
    return APIResponse(data={"id": item.id, "message": "Created"})


@router.get("/{id}", response_model=APIResponse[PromoBannerOut])
async def get_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    d = {}
    for c in item.__table__.columns.keys():
        v = getattr(item, c)
        if isinstance(v, datetime): d[c] = v.isoformat()
        else: d[c] = v
    return APIResponse(data=d)

@router.patch("/{id}", response_model=APIResponse[dict])
async def update_item(db: DBDependency, admin: CurrentAdmin, id: int, data: PromoBannerUpdate):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    setattr(item, "updated_at", datetime.now(timezone.utc))
    await db.commit()
    await auto_translate_record(db, "promo_banners", item.id, {"title": item.title or "", "short_description": item.short_description or ""})
    return APIResponse(data={"id": item.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(PromoBanner).where(PromoBanner.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    await db.delete(item); await db.commit()
    await delete_translations(db, "promo_banners", id)
    return APIResponse(data={"id": id, "deleted": True})
