from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.customer import Customer
from app.models.notification import Notification
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Customer = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count()).select_from(Notification).where(Notification.user_id == user.id)
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    return result.scalars().all()


@router.put("/{notification_id}/read")
async def mark_read(notification_id: int, user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    n = result.scalar_one_or_none()
    if n:
        n.is_read = True
        await db.flush()
    return {"message": "Marked as read"}


@router.put("/read-all")
async def mark_all_read(user: Customer = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.is_read == False)
    )
    for n in result.scalars().all():
        n.is_read = True
    await db.flush()
    return {"message": "All marked as read"}
