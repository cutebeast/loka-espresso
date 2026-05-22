"""Information cards admin endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.info_card import InformationCard
from app.schemas.content import InfoCardCreate, InfoCardOut, InfoCardUpdate
from app.services.translation import auto_translate_record, delete_translations
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/info-cards", tags=["admin — information cards"])


@router.get("", response_model=APIResponse[PaginatedResponse[InfoCardOut]])
async def list_cards(
    db: DBDependency, admin: CurrentAdmin,
    content_type: str | None = Query(None),
    page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=100),
):
    base = select(InformationCard)
    cnt = select(func.count(InformationCard.id))
    if content_type:
        base = base.where(InformationCard.content_type == content_type)
        cnt = cnt.where(InformationCard.content_type == content_type)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(InformationCard.position).offset((page-1)*per_page).limit(per_page))
    items = [{c: getattr(r, c) for c in r.__table__.columns.keys()} for r in result.scalars().all()]
    for i, r in zip(items, result.scalars().all()):
        i["created_at"] = r.created_at.isoformat() if r.created_at else None
        i["updated_at"] = r.updated_at.isoformat() if r.updated_at else None
        i["start_date"] = r.start_date.isoformat() if r.start_date else None
        i["end_date"] = r.end_date.isoformat() if r.end_date else None
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))


@router.get("/{id}", response_model=APIResponse[InfoCardOut])
async def get_card(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(InformationCard).where(InformationCard.id == id))
    card = result.scalar_one_or_none()
    if not card: raise HTTPException(404, "Not found")
    d = {c: getattr(card, c) for c in card.__table__.columns.keys()}
    for k in ["created_at","updated_at","start_date","end_date"]:
        v = getattr(card, k, None)
        if v: d[k] = v.isoformat()
    return APIResponse(data=d)

@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_card(db: DBDependency, admin: CurrentAdmin, data: InfoCardCreate):
    create_data = data.model_dump(exclude_unset=True)
    if not create_data.get("slug") and data.title:
        create_data["slug"] = data.title.lower().replace(" ", "-")
    card = InformationCard(**create_data)
    db.add(card); await db.commit(); await db.refresh(card)
    await auto_translate_record(db, "information_cards", card.id, {"title": data.title or "", "short_description": data.short_description or "", "long_description": data.long_description or ""})
    return APIResponse(data={"id": card.id, "title": card.title, "slug": card.slug, "message": "Created"})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_card(db: DBDependency, admin: CurrentAdmin, id: int, data: InfoCardUpdate):
    result = await db.execute(select(InformationCard).where(InformationCard.id == id))
    card = result.scalar_one_or_none()
    if not card: raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(card, field, value)
    card.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "information_cards", id, {"title": data.title or "", "short_description": data.short_description or "", "long_description": data.long_description or ""})
    return APIResponse(data={"id": card.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_card(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(InformationCard).where(InformationCard.id == id))
    card = result.scalar_one_or_none()
    if not card: raise HTTPException(404, "Not found")
    await db.delete(card); await db.commit()
    await delete_translations(db, "information_cards", id)
    return APIResponse(data={"id": id, "deleted": True})
