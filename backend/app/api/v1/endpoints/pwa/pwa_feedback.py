"""PWA-facing feedback endpoint — customer submits feedback/support request."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.feedback import Feedback
from app.models.customer import Customer
from app.schemas.admin_extras import FeedbackCreate, FeedbackOut

router = APIRouter(tags=["PWA Feedback"])


class FeedbackPwaCreate(FeedbackCreate):
    """PWA variant: store_id is optional (help requests may not be store-specific)."""
    store_id: int | None = None


@router.post("/feedback", response_model=FeedbackOut, status_code=201)
async def submit_feedback(
    body: FeedbackPwaCreate,
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer submits feedback or support request."""
    # If no store_id provided, fall back to the first active store
    store_id = body.store_id
    if store_id is None:
        from sqlalchemy import select
        from app.models.store import Store
        r = await db.execute(select(Store.id).where(Store.is_active == True).limit(1))
        first = r.scalar_one_or_none()
        if not first:
            raise HTTPException(400, "No active store available for feedback submission")
        store_id = first

    fb = Feedback(
        user_id=user.id,
        customer_id=user.id,
        store_id=store_id,
        order_id=body.order_id,
        rating=body.rating,
        comment=body.comment,
        tags=body.tags,
    )
    db.add(fb)
    await db.flush()

    return FeedbackOut(
        id=fb.id,
        user_id=fb.user_id,
        store_id=store_id,
        order_id=fb.order_id,
        rating=fb.rating,
        comment=fb.comment,
        tags=fb.tags,
        is_resolved=fb.is_resolved,
        admin_reply=fb.admin_reply,
        created_at=fb.created_at,
        user_name=user.name or "Anonymous",
        store_name=None,
    )
