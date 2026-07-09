"""Public help center article endpoints for admin, staff, and customer portals."""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale
from app.models.help import HelpArticle
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.help import HelpArticlePublicOut
from app.services.translation import translate_single

router = APIRouter(prefix="/help", tags=["public — help center"])


@router.get("/articles", response_model=APIResponse[PaginatedResponse[HelpArticlePublicOut]])
async def list_help_articles(
    db: DBDependency,
    locale: OptionalLocale,
    audience: str = Query(..., description="admin, staff, or customer"),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
):
    base = select(HelpArticle).where(
        HelpArticle.audience == audience,
        HelpArticle.is_active.is_(True),
    )
    if category:
        base = base.where(HelpArticle.category == category)
    result = await db.execute(
        base.order_by(HelpArticle.position.asc(), HelpArticle.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = []
    for r in result.scalars().all():
        item_dict = HelpArticlePublicOut.model_validate(r).model_dump()
        await translate_single(db, item_dict, "help_articles", locale)
        items.append(item_dict)
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=len(items),
            page=page,
            per_page=per_page,
            total_pages=1,
        )
    )


@router.get("/articles/{slug}", response_model=APIResponse[HelpArticlePublicOut])
async def get_help_article(
    db: DBDependency,
    locale: OptionalLocale,
    slug: str,
):
    stmt = select(HelpArticle).where(
        HelpArticle.slug == slug,
        HelpArticle.is_active.is_(True),
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    item_dict = HelpArticlePublicOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "help_articles", locale)
    return APIResponse(data=item_dict)
