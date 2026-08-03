"""Admin feedback management endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency, require_store_admin
from app.core.rate_limiter import limiter
from app.models.customer import Customer
from app.models.feedback import FeedbackEntry
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.feedback import FeedbackCreate, FeedbackEntryOut, FeedbackReplyRequest, FeedbackStatsOut

router = APIRouter(prefix="/admin/feedback", tags=["admin — feedback"])
public_router = APIRouter(tags=["feedback"])


def _parse_filter_date(value: str | None, end_of_day: bool = False):
    """Parse a feedback date filter ('2026-08-01' or ISO datetime) to a
    datetime — raw strings crash against the timestamptz column
    ('operator does not exist: timestamptz >= character varying')."""
    if not value:
        return None
    try:
        if len(value) == 10:
            dt = datetime.fromisoformat(value)
            return dt.replace(hour=23, minute=59, second=59) if end_of_day else dt
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date filter '{value}'")


@router.get("", response_model=APIResponse[PaginatedResponse[FeedbackEntryOut]])
async def list_feedback(
    admin: CurrentAdmin,
    db: DBDependency,
    store_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List customer feedback with filters."""
    base = select(FeedbackEntry)
    cnt = select(func.count(FeedbackEntry.id))

    if store_id is not None:
        base = base.where(FeedbackEntry.store_id == store_id)
        cnt = cnt.where(FeedbackEntry.store_id == store_id)
    from_dt = _parse_filter_date(from_date)
    to_dt = _parse_filter_date(to_date, end_of_day=True)
    if from_dt:
        base = base.where(FeedbackEntry.created_at >= from_dt)
        cnt = cnt.where(FeedbackEntry.created_at >= from_dt)
    if to_dt:
        base = base.where(FeedbackEntry.created_at <= to_dt)
        cnt = cnt.where(FeedbackEntry.created_at <= to_dt)

    total = (await db.execute(cnt)).scalar() or 0

    stmt = base.order_by(FeedbackEntry.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    entries = result.scalars().all()

    # Batch resolve names
    customer_ids = list({e.customer_id for e in entries})
    store_ids = list({e.store_id for e in entries if e.store_id})

    cust_map: dict[int, str] = {}
    if customer_ids:
        cr = await db.execute(select(Customer.id, Customer.display_name).where(Customer.id.in_(customer_ids)))
        for cid, name in cr.all():
            cust_map[cid] = name or f"Customer #{cid}"

    store_map: dict[int, str] = {}
    if store_ids:
        sr = await db.execute(select(Store.id, Store.store_name).where(Store.id.in_(store_ids)))
        for sid, name in sr.all():
            store_map[sid] = name or f"Store #{sid}"

    items = []
    for e in entries:
        d = FeedbackEntryOut.model_validate(e).model_dump()
        d["customer_name"] = cust_map.get(e.customer_id)
        d["store_name"] = store_map.get(e.store_id) if e.store_id else None
        items.append(d)

    return APIResponse(
        data=PaginatedResponse(
            items=items, total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page if per_page else 0,
        )
    )


@router.get("/stats", response_model=APIResponse[FeedbackStatsOut])
async def feedback_stats(
    admin: CurrentAdmin,
    db: DBDependency,
    store_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Get feedback statistics."""
    base = select(FeedbackEntry.rating, func.count(FeedbackEntry.id))
    avg_stmt = select(func.avg(FeedbackEntry.rating))
    count_stmt = select(func.count(FeedbackEntry.id))

    if store_id is not None:
        base = base.where(FeedbackEntry.store_id == store_id)
        avg_stmt = avg_stmt.where(FeedbackEntry.store_id == store_id)
        count_stmt = count_stmt.where(FeedbackEntry.store_id == store_id)
    from_dt = _parse_filter_date(from_date)
    to_dt = _parse_filter_date(to_date, end_of_day=True)
    if from_dt:
        base = base.where(FeedbackEntry.created_at >= from_dt)
        avg_stmt = avg_stmt.where(FeedbackEntry.created_at >= from_dt)
        count_stmt = count_stmt.where(FeedbackEntry.created_at >= from_dt)
    if to_dt:
        base = base.where(FeedbackEntry.created_at <= to_dt)
        avg_stmt = avg_stmt.where(FeedbackEntry.created_at <= to_dt)
        count_stmt = count_stmt.where(FeedbackEntry.created_at <= to_dt)

    base = base.group_by(FeedbackEntry.rating)

    dist_result = await db.execute(base)
    distribution: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for rating, cnt in dist_result.all():
        if rating is None:
            continue  # unrated entries (support tickets / guest feedback) — no star bucket
        distribution[rating] = cnt

    avg_val = (await db.execute(avg_stmt)).scalar()
    total_val = (await db.execute(count_stmt)).scalar() or 0

    return APIResponse(
        data=FeedbackStatsOut(
            average_rating=round(float(avg_val or 0), 1),
            total_reviews=total_val,
            rating_distribution=distribution,
        )
    )


@router.post("/{feedback_id}/reply", response_model=APIResponse[FeedbackEntryOut])
async def reply_feedback(
    admin: CurrentAdmin,
    db: DBDependency,
    feedback_id: int,
    data: FeedbackReplyRequest,
):
    """Reply to (or clear reply on) a feedback entry."""
    result = await db.execute(select(FeedbackEntry).where(FeedbackEntry.id == feedback_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    # Store-scoped replies: a store_manager may only reply to feedback for
    # their own store(s).
    if entry.store_id is not None:
        await require_store_admin(db, admin, entry.store_id)

    if data.clear_reply:
        entry.admin_reply = None
        entry.replied_at = None
        entry.replied_by = None
    else:
        entry.admin_reply = data.admin_reply
        entry.replied_at = datetime.now(timezone.utc)
        entry.replied_by = admin.id

    await db.commit()
    await db.refresh(entry)

    # Resolve customer/store names
    cust_name = None
    if entry.customer_id:
        cr = await db.execute(select(Customer.display_name).where(Customer.id == entry.customer_id))
        cust_name = cr.scalar_one_or_none()
    store_name = None
    if entry.store_id:
        sr = await db.execute(select(Store.store_name).where(Store.id == entry.store_id))
        store_name = sr.scalar_one_or_none()

    out = FeedbackEntryOut.model_validate(entry).model_dump()
    out["customer_name"] = cust_name
    out["store_name"] = store_name

    return APIResponse(data=out)


# ---------------------------------------------------------------------------
# Public feedback submission
# ---------------------------------------------------------------------------

@public_router.post("/feedback", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def submit_feedback(
    request: Request,
    db: DBDependency,
    data: FeedbackCreate,
):
    """Submit customer feedback.

    Public endpoint — does not require authentication. If a customer token
    is present, the feedback is linked to their account. Guests can submit
    feedback anonymously.
    """
    # Try to extract customer from token (optional)
    customer_id = None
    from app.core.security import decode_token
    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if token:
        try:
            payload = decode_token(token)
            if payload and payload.get("type") == "access" and payload.get("customer_id"):
                customer_id = int(payload["customer_id"])
        except Exception:
            pass

    title = data.title or data.subject or "Feedback"
    body = data.body or data.message or ""
    rating = data.rating

    # Validate rating when provided - support tickets may omit it
    if rating is not None:
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Rating must be an integer between 1 and 5",
            )

    entry = FeedbackEntry(
        customer_id=customer_id,
        store_id=data.store_id,
        title=title,
        body=body,
        rating=rating,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return APIResponse(data={"id": entry.id, "message": "Feedback submitted"})
