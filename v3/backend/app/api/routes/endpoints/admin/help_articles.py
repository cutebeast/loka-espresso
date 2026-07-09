"""Admin help center / internal wiki article endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.help import HelpArticle
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.help import HelpArticleCreate, HelpArticleOut, HelpArticleUpdate
from app.services.translation import auto_translate_record, delete_translations

router = APIRouter(prefix="/admin/help-articles", tags=["admin — help center"])


@router.get("", response_model=APIResponse[PaginatedResponse[HelpArticleOut]])
async def list_help_articles(
    db: DBDependency,
    admin: CurrentAdmin,
    audience: str | None = Query(None),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
):
    base = select(HelpArticle)
    cnt = select(func.count(HelpArticle.id))
    if audience:
        base = base.where(HelpArticle.audience == audience)
        cnt = cnt.where(HelpArticle.audience == audience)
    if category:
        base = base.where(HelpArticle.category == category)
        cnt = cnt.where(HelpArticle.category == category)
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(
        base.order_by(HelpArticle.position.asc(), HelpArticle.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = []
    for r in result.scalars().all():
        d = {}
        for c in r.__table__.columns.keys():
            v = getattr(r, c)
            if isinstance(v, datetime):
                d[c] = v.isoformat()
            else:
                d[c] = v
        items.append(d)
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )


@router.get("/{id}", response_model=APIResponse[HelpArticleOut])
async def get_help_article(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(HelpArticle).where(HelpArticle.id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Not found")
    d = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    for k in ["created_at", "updated_at"]:
        if getattr(item, k):
            d[k] = getattr(item, k).isoformat()
    return APIResponse(data=d)


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_help_article(
    db: DBDependency, admin: CurrentAdmin, data: HelpArticleCreate
):
    item = HelpArticle(**data.model_dump(exclude_unset=True))
    db.add(item)
    await db.commit()
    await auto_translate_record(
        db,
        "help_articles",
        item.id,
        {"title": data.title or "", "body_text": data.body_text or ""},
    )
    await db.refresh(item)
    return APIResponse(data={"id": item.id, "message": "Created"})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_help_article(
    db: DBDependency, admin: CurrentAdmin, id: int, data: HelpArticleUpdate
):
    result = await db.execute(select(HelpArticle).where(HelpArticle.id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    setattr(item, "updated_at", datetime.now(timezone.utc))
    await db.commit()
    await auto_translate_record(
        db,
        "help_articles",
        item.id,
        {"title": item.title or "", "body_text": item.body_text or ""},
    )
    return APIResponse(data={"id": item.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_help_article(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(HelpArticle).where(HelpArticle.id == id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Not found")
    await db.delete(item)
    await db.commit()
    await delete_translations(db, "help_articles", id)
    return APIResponse(data={"id": id, "deleted": True})
