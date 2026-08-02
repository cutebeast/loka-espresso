"""Public help center article endpoints for admin, staff, and customer portals."""
from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale
from app.core.security import decode_token
from app.models.help import HelpArticle
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.help import HelpArticlePublicOut
from app.services.translation import translate_single

router = APIRouter(prefix="/help", tags=["public — help center"])

VALID_AUDIENCES = {"customer", "admin", "staff"}


def _candidate_tokens(request: Request, *cookie_names: str) -> list[str]:
    """Collect identity tokens from the portal cookies and the bearer header.

    The admin/staff portals call these endpoints through their same-origin
    proxies with the HttpOnly admin_token / staff_token cookies attached.
    """
    tokens: list[str] = []
    for name in cookie_names:
        token = request.cookies.get(name)
        if token:
            tokens.append(token)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        tokens.append(auth_header[len("Bearer "):])
    return tokens


def _has_admin_identity(request: Request) -> bool:
    """True when the request carries a valid token with an admin_id claim."""
    for token in _candidate_tokens(request, "admin_token", "staff_token"):
        try:
            payload = decode_token(token)
        except Exception:
            continue
        if payload.get("type") in ("access", "admin", "staff") and payload.get("admin_id"):
            return True
    return False


def _has_staff_identity(request: Request) -> bool:
    """True when the request carries a valid staff-portal token (or an admin —
    admins manage and read all audiences)."""
    for token in _candidate_tokens(request, "staff_token", "admin_token"):
        try:
            payload = decode_token(token)
        except Exception:
            continue
        token_type = payload.get("type")
        if token_type == "staff" and (payload.get("staff_id") or payload.get("admin_id")):
            return True
        # Admins browsing the staff portal before store selection
        if token_type == "admin" and payload.get("admin_id"):
            return True
        # Admin-portal access tokens — admins can read staff-audience articles
        if token_type == "access" and payload.get("admin_id"):
            return True
    return False


def _enforce_audience(request: Request, audience: str) -> None:
    """Gate internal-audience articles to their portal's identity."""
    if audience == "customer":
        return
    if audience == "admin":
        if not _has_admin_identity(request):
            raise HTTPException(status_code=401, detail="Admin authentication required")
        return
    if audience == "staff":
        if not _has_staff_identity(request):
            raise HTTPException(status_code=401, detail="Staff authentication required")
        return
    raise HTTPException(status_code=400, detail="Unknown audience")


@router.get("/articles", response_model=APIResponse[PaginatedResponse[HelpArticlePublicOut]])
async def list_help_articles(
    request: Request,
    db: DBDependency,
    locale: OptionalLocale,
    audience: str = Query(..., description="admin, staff, or customer"),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
):
    _enforce_audience(request, audience)
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
    request: Request,
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
    _enforce_audience(request, item.audience)
    item_dict = HelpArticlePublicOut.model_validate(item).model_dump()
    await translate_single(db, item_dict, "help_articles", locale)
    return APIResponse(data=item_dict)
