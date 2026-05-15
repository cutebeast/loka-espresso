"""Admin product cards endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.info_card import ProductCard
from app.schemas.content import ProductCardOut
from app.services.translation import auto_translate_record, delete_translations
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/product-cards", tags=["admin — product cards"])


@router.get("", response_model=APIResponse[PaginatedResponse[ProductCardOut]])
async def list_items(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=100)):
    base = select(ProductCard)
    cnt = select(func.count(ProductCard.id))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(ProductCard.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = []
    for r in result.scalars().all():
        d = {}
        for c in r.__table__.columns.keys():
            v = getattr(r, c)
            if isinstance(v, datetime): d[c] = v.isoformat()
            else: d[c] = v
        items.append(d)
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))

@router.get("/{id}", response_model=APIResponse[ProductCardOut])
async def get_item(db: DBDependency, admin: CurrentAdmin, id: int):
    from app.models.info_card import ProductCard
    result = await db.execute(select(ProductCard).where(ProductCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    d = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    for k in ["created_at","updated_at"]:
        v = getattr(item, k, None)
        if v: d[k] = v.isoformat()
    return APIResponse(data=d)

@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_item(db: DBDependency, admin: CurrentAdmin, data: dict):
    kwargs = {k: data.get(k) for k in ['title', 'slug', 'short_description', 'long_description', 'image_url', 'price', 'action_url', 'action_label', 'is_active', 'position', 'image_gallery_urls', 'gallery_video_url'] if k in data}
    if "slug" in kwargs and not kwargs["slug"]:
        kwargs["slug"] = (data.get("title","") or "").lower().replace(" ","-")[:50]
    item = ProductCard(**kwargs)
    db.add(item); await db.commit(); await db.refresh(item)
    await auto_translate_record(db, "product_cards", item.id, {"title": data.get("title",""), "short_description": data.get("short_description",""), "long_description": data.get("long_description","")})
    return APIResponse(data={"id": item.id, "message": "Created"})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_item(db: DBDependency, admin: CurrentAdmin, id: int, data: dict):
    result = await db.execute(select(ProductCard).where(ProductCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    for k in ['title', 'slug', 'short_description', 'long_description', 'image_url', 'price', 'action_url', 'action_label', 'is_active', 'position', 'image_gallery_urls', 'gallery_video_url']:
        if k in data: setattr(item, k, data[k])
    setattr(item, "updated_at", datetime.now(timezone.utc))
    await db.commit()
    await auto_translate_record(db, "product_cards", id, {"title": data.get("title",""), "short_description": data.get("short_description",""), "long_description": data.get("long_description","")})
    return APIResponse(data={"id": item.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(ProductCard).where(ProductCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    await db.delete(item); await db.commit()
    await delete_translations(db, "product_cards", id)
    return APIResponse(data={"id": id, "deleted": True})
