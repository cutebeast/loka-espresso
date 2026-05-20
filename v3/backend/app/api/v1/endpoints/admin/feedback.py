"""Admin feedback management endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.feedback import FeedbackEntry
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.feedback import FeedbackEntryOut, FeedbackReplyRequest, FeedbackStatsOut

router = APIRouter(prefix="/admin/feedback", tags=["admin — feedback"])
public_router = APIRouter(tags=["feedback"])


@router.get("", response_model=APIResponse[PaginatedResponse[FeedbackEntryOut]])
async def list_feedback(
    admin: CurrentAdmin,
    db: DBDependency,
    store_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List customer feedback with filters."""
    base = select(FeedbackEntry)
    cnt = select(func.count(FeedbackEntry.id))

    if store_id is not None:
        base = base.where(FeedbackEntry.store_id == store_id)
        cnt = cnt.where(FeedbackEntry.store_id == store_id)
    if from_date:
        base = base.where(FeedbackEntry.created_at >= from_date)
        cnt = cnt.where(FeedbackEntry.created_at >= from_date)
    if to_date:
        base = base.where(FeedbackEntry.created_at <= to_date)
        cnt = cnt.where(FeedbackEntry.created_at <= to_date)

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
    if from_date:
        base = base.where(FeedbackEntry.created_at >= from_date)
        avg_stmt = avg_stmt.where(FeedbackEntry.created_at >= from_date)
        count_stmt = count_stmt.where(FeedbackEntry.created_at >= from_date)
    if to_date:
        base = base.where(FeedbackEntry.created_at <= to_date)
        avg_stmt = avg_stmt.where(FeedbackEntry.created_at <= to_date)
        count_stmt = count_stmt.where(FeedbackEntry.created_at <= to_date)

    base = base.group_by(FeedbackEntry.rating)

    dist_result = await db.execute(base)
    distribution: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for rating, cnt in dist_result.all():
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
async def submit_feedback(
    db: DBDependency,
    data: dict,
    customer: ActiveCustomer,
):
    """Submit customer feedback."""
    title = data.get("title") or data.get("subject") or "Feedback"
    body = data.get("body") or data.get("message") or ""
    rating = data.get("rating", 5)
    store_id = data.get("store_id")

    # Validate rating
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        rating = 5

    entry = FeedbackEntry(
        customer_id=customer.id,
        store_id=store_id,
        title=title,
        body=body,
        rating=rating,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return APIResponse(data={"id": entry.id, "message": "Feedback submitted"})
