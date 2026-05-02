from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.admin_user import AdminUser
from app.models.customer import CustomerDeviceToken
from app.models.notification import Notification, NotificationBroadcast
from app.schemas.admin_extras import (
    BroadcastCreate,
    BroadcastOut,
)

router = APIRouter(prefix="/admin", tags=["Admin Broadcasts"])


@router.get("/broadcasts")
async def list_broadcasts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_archived: bool | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    query = select(NotificationBroadcast)
    count_query = select(func.count(NotificationBroadcast.id))

    if is_archived is not None:
        query = query.where(NotificationBroadcast.is_archived == is_archived)
        count_query = count_query.where(NotificationBroadcast.is_archived == is_archived)
    else:
        query = query.where(NotificationBroadcast.is_archived == False)
        count_query = count_query.where(NotificationBroadcast.is_archived == False)

    if from_date:
        try:
            fd = datetime.fromisoformat(from_date)
            query = query.where(NotificationBroadcast.created_at >= fd)
            count_query = count_query.where(NotificationBroadcast.created_at >= fd)
        except ValueError:
            pass
    if to_date:
        try:
            td = datetime.fromisoformat(to_date + "T23:59:59")
            query = query.where(NotificationBroadcast.created_at <= td)
            count_query = count_query.where(NotificationBroadcast.created_at <= td)
        except ValueError:
            pass

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(NotificationBroadcast.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": [
            {
                "id": b.id,
                "title": b.title,
                "body": b.body,
                "audience": b.audience,
                "store_id": b.store_id,
                "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
                "sent_at": b.sent_at.isoformat() if b.sent_at else None,
                "sent_count": b.sent_count,
                "open_count": b.open_count,
                "is_archived": b.is_archived,
                "status": b.status or "draft",
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.patch("/broadcasts/{broadcast_id}/archive")
async def toggle_archive_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    obj.is_archived = not obj.is_archived
    ip = get_client_ip(request)
    action = "ARCHIVE_BROADCAST" if obj.is_archived else "UNARCHIVE_BROADCAST"
    await log_action(db, action=action, user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return {"id": obj.id, "is_archived": obj.is_archived}


@router.get("/broadcasts/{broadcast_id}")
async def get_broadcast(
    broadcast_id: int,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    return {
        "id": obj.id,
        "title": obj.title,
        "body": obj.body,
        "audience": obj.audience,
        "store_id": obj.store_id,
        "scheduled_at": obj.scheduled_at.isoformat() if obj.scheduled_at else None,
        "sent_at": obj.sent_at.isoformat() if obj.sent_at else None,
        "sent_count": obj.sent_count,
        "open_count": obj.open_count,
        "is_archived": obj.is_archived,
        "status": obj.status,
        "created_at": obj.created_at.isoformat() if obj.created_at else None,
    }


@router.post("/broadcasts", response_model=BroadcastOut)
async def create_broadcast(
    request: Request,
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    obj = NotificationBroadcast(created_by=user.id, status=data.status, **data.model_dump(exclude={"status"}))
    db.add(obj)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=obj.id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.put("/broadcasts/{broadcast_id}")
async def update_broadcast(
    broadcast_id: int,
    request: Request,
    data: BroadcastCreate,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status not in ("draft", "pending"):
        raise HTTPException(400, "Can only edit draft broadcasts")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.delete("/broadcasts/{broadcast_id}")
async def delete_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status == "sent":
        raise HTTPException(400, "Cannot delete a sent broadcast. Archive it instead.")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id, details={"title": obj.title}, ip_address=ip)
    await db.delete(obj)
    await db.flush()
    return {"message": "Broadcast deleted"}


@router.post("/broadcasts/{broadcast_id}/send")
async def send_broadcast(
    broadcast_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: AdminUser = Depends(require_hq_access()),
):
    result = await db.execute(select(NotificationBroadcast).where(NotificationBroadcast.id == broadcast_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Broadcast not found")
    if obj.status not in ("draft", "pending"):
        raise HTTPException(400, "Can only send draft broadcasts")

    tokens_result = await db.execute(
        select(CustomerDeviceToken).where(CustomerDeviceToken.is_active == True)
    )
    device_tokens = tokens_result.scalars().all()

    sent_count = 0
    for dt in device_tokens:
        try:
            notif = Notification(
                user_id=dt.customer_id,
                customer_id=dt.customer_id,
                title=obj.title,
                body=obj.body,
                type="broadcast",
                data={"broadcast_id": obj.id, "image_url": obj.image_url},
            )
            db.add(notif)
            sent_count += 1
        except Exception:
            continue

    await db.flush()
    obj.status = "sent"
    obj.sent_at = datetime.now(timezone.utc)
    obj.sent_count = sent_count
    ip = get_client_ip(request)
    await log_action(db, action="SEND_BROADCAST", user_id=user.id, entity_type="broadcast", entity_id=broadcast_id,
                     details={"title": obj.title, "sent_count": sent_count, "total_devices": len(device_tokens)}, ip_address=ip)
    await db.flush()
    await db.refresh(obj)
    return {"id": obj.id, "status": obj.status, "sent_count": sent_count,
            "sent_at": obj.sent_at.isoformat() if obj.sent_at else None}
