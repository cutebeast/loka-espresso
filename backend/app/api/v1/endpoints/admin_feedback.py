from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.admin_extras import Feedback
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
        }
        items.append(d)
    return items


# NOTE: /stats MUST be defined BEFORE /{feedback_id} to avoid route conflict
@router.get("/admin/feedback/stats")
async def feedback_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(
        select(Feedback.store_id, func.avg(Feedback.rating).label("avg_rating"), func.count().label("count"))
        .group_by(Feedback.store_id)
    )
    return [
        {"store_id": store_id, "avg_rating": float(avg), "count": count}
        for store_id, avg, count in result.all()
    ]


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
    await db.flush()
    await db.refresh(feedback)
    await db.commit()
    return {"message": "Reply saved", "id": feedback.id}


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
