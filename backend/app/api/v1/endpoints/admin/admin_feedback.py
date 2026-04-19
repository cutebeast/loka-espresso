from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import get_current_user, require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.sanitization import sanitize_text_field
from app.models.user import User
from app.models.admin_extras import Feedback
from app.models.store import Store
from app.schemas.admin_extras import FeedbackCreate, FeedbackOut, FeedbackReply

router = APIRouter()


@router.get("/admin/feedback")
async def list_feedback(
    store_id: int | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    base = select(Feedback, User.name.label("user_name")).join(User, User.id == Feedback.user_id, isouter=True)
    if store_id is not None:
        base = base.where(Feedback.store_id == store_id)
    if from_date is not None:
        base = base.where(Feedback.created_at >= from_date)
    if to_date is not None:
        base = base.where(Feedback.created_at <= to_date)

    count_result = await db.execute(select(func.count()).select_from(Feedback))
    total = count_result.scalar() or 0
    total_pages = (total + page_size - 1) // page_size

    query = base.order_by(desc(Feedback.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()
    items = []
    for feedback, user_name in rows:
        d = {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "store_id": feedback.store_id,
            "rating": feedback.rating,
            "comment": feedback.comment,
            "is_resolved": feedback.is_resolved,
            "admin_reply": feedback.admin_reply,
            "created_at": feedback.created_at,
            "user_name": user_name,
            "customer_name": user_name,
            "store_name": None,
            "reply": feedback.admin_reply,
        }
        items.append(d)

    # Resolve store names in bulk
    store_ids = {i["store_id"] for i in items if i["store_id"]}
    if store_ids:
        store_result = await db.execute(select(Store).where(Store.id.in_(store_ids)))
        store_map = {s.id: s.name for s in store_result.scalars().all()}
        for i in items:
            if i["store_id"] and i["store_id"] in store_map:
                i["store_name"] = store_map[i["store_id"]]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# NOTE: /stats MUST be defined BEFORE /{feedback_id} to avoid route conflict
@router.get("/admin/feedback/stats")
async def feedback_stats(
    store_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    query = select(Feedback)
    if store_id is not None:
        query = query.where(Feedback.store_id == store_id)
    result = await db.execute(query)
    all_fb = result.scalars().all()

    if not all_fb:
        return {"average_rating": 0, "total_reviews": 0, "rating_distribution": {}}

    avg = sum(f.rating for f in all_fb) / len(all_fb)
    dist: dict[str, int] = {}
    for f in all_fb:
        key = str(f.rating)
        dist[key] = dist.get(key, 0) + 1

    return {
        "average_rating": round(avg, 1),
        "total_reviews": len(all_fb),
        "rating_distribution": dist,
    }


@router.get("/admin/feedback/{feedback_id}")
async def get_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(
        select(Feedback, User.name.label("user_name"))
        .join(User, User.id == Feedback.user_id, isouter=True)
        .where(Feedback.id == feedback_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    feedback, user_name = row
    return {
        "id": feedback.id,
        "user_id": feedback.user_id,
        "store_id": feedback.store_id,
        "rating": feedback.rating,
        "comment": feedback.comment,
        "is_resolved": feedback.is_resolved,
        "admin_reply": feedback.admin_reply,
        "created_at": feedback.created_at,
        "user_name": user_name,
    }


@router.post("/admin/feedback/{feedback_id}/reply")
async def reply_to_feedback(
    feedback_id: int,
    request: Request,
    data: FeedbackReply,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    # Sanitize admin reply to prevent XSS
    feedback.admin_reply = sanitize_text_field(data.admin_reply, max_length=2000)
    feedback.is_resolved = True
    ip = get_client_ip(request)
    await log_action(db, action="REPLY_FEEDBACK", user_id=user.id, store_id=feedback.store_id, entity_type="feedback", entity_id=feedback_id, ip_address=ip)
    await db.flush()
    await db.refresh(feedback)
    return {"message": "Reply saved", "id": feedback.id}


@router.put("/admin/feedback/{feedback_id}/reply")
async def update_feedback_reply(
    feedback_id: int,
    request: Request,
    data: FeedbackReply,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_hq_access()),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(404)
    if data.admin_reply and data.admin_reply.strip():
        feedback.admin_reply = data.admin_reply
        feedback.is_resolved = True
    else:
        feedback.admin_reply = None
        feedback.is_resolved = False
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_FEEDBACK_REPLY" if feedback.admin_reply else "DELETE_FEEDBACK_REPLY", user_id=user.id, store_id=feedback.store_id, entity_type="feedback", entity_id=feedback_id, ip_address=ip)
    await db.flush()
    await db.refresh(feedback)
    return {"message": "Reply updated", "id": feedback.id}


@router.post("/feedback", response_model=FeedbackOut)
async def create_feedback(
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Sanitize user input to prevent XSS
    sanitized_data = data.model_dump()
    sanitized_data["comment"] = sanitize_text_field(sanitized_data.get("comment"), max_length=2000)
    
    obj = Feedback(user_id=user.id, **sanitized_data)
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj
