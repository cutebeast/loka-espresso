from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.audit import log_action, get_client_ip
from app.models.user import User, UserRole
from app.models.admin_extras import Feedback
from app.models.store import Store
from app.schemas.admin_extras import FeedbackCreate, FeedbackOut, FeedbackReply

router = APIRouter()


@router.get("/admin/feedback")
async def list_feedback(
    store_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    query = (
        select(Feedback, User.name.label("user_name"))
        .join(User, User.id == Feedback.user_id, isouter=True)
    )
    if store_id is not None:
        query = query.where(Feedback.store_id == store_id)
    query = query.order_by(desc(Feedback.created_at)).offset((page - 1) * page_size).limit(page_size)
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
    return items


# NOTE: /stats MUST be defined BEFORE /{feedback_id} to avoid route conflict
@router.get("/admin/feedback/stats")
async def feedback_stats(
    store_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
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
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(
        select(Feedback, User.name.label("user_name"))
        .join(User, User.id == Feedback.user_id, isouter=True)
        .where(Feedback.id == feedback_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(404)
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
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(404)
    feedback.admin_reply = data.admin_reply
    feedback.is_resolved = True
    ip = get_client_ip(request)
    await log_action(db, action="REPLY_FEEDBACK", user_id=user.id, store_id=feedback.store_id, entity_type="feedback", entity_id=feedback_id, ip_address=ip)
    await db.flush()
    await db.refresh(feedback)
    await db.commit()
    return {"message": "Reply saved", "id": feedback.id}


@router.put("/admin/feedback/{feedback_id}/reply")
async def update_feedback_reply(
    feedback_id: int,
    request: Request,
    data: FeedbackReply,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
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
    await db.commit()
    return {"message": "Reply updated", "id": feedback.id}


@router.post("/feedback", response_model=FeedbackOut)
async def create_feedback(
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obj = Feedback(user_id=user.id, **data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj
