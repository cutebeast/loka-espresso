"""Admin and public notification endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import ActiveCustomer, CurrentAdmin, DBDependency
from app.models.notification import (
    NotificationDeliveryLog,
    NotificationMessage,
    NotificationPreference,
)
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.notification import (
    AdminNotificationCreate,
    NotificationDeliveryLogOut,
    NotificationMessageOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
)

admin_router = APIRouter(prefix="/admin/notifications", tags=["admin — notifications"])
public_router = APIRouter(prefix="/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[NotificationMessageOut]])
async def list_notifications(
    db: DBDependency,
    admin: CurrentAdmin,
    customer_id: int | None = Query(None),
    message_type: str | None = Query(None),
    is_read: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List notification messages with filters."""
    base_stmt = select(NotificationMessage)
    count_stmt = select(func.count(NotificationMessage.id))

    if customer_id is not None:
        base_stmt = base_stmt.where(NotificationMessage.customer_id == customer_id)
        count_stmt = count_stmt.where(NotificationMessage.customer_id == customer_id)
    if message_type is not None:
        base_stmt = base_stmt.where(NotificationMessage.message_type == message_type)
        count_stmt = count_stmt.where(NotificationMessage.message_type == message_type)
    if is_read is not None:
        base_stmt = base_stmt.where(NotificationMessage.is_read.is_(is_read))
        count_stmt = count_stmt.where(NotificationMessage.is_read.is_(is_read))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(NotificationMessage.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [NotificationMessageOut.model_validate(n) for n in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("", response_model=APIResponse[NotificationMessageOut], status_code=status.HTTP_201_CREATED)
async def send_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    data: AdminNotificationCreate,
):
    """Send a notification to customer(s)."""
    if data.customer_ids:
        # Send to specific customers
        for cid in data.customer_ids:
            msg = NotificationMessage(
                customer_id=cid,
                message_type=data.message_type,
                priority=data.priority,
                title=data.title,
                body=data.body,
                image_url=data.image_url,
                action_url=data.action_url,
                action_type=data.action_type,
                action_payload=data.action_payload,
                expires_at=data.expires_at,
            )
            db.add(msg)
        await db.commit()
        # Return the last created message as a representative
        return APIResponse(data=NotificationMessageOut.model_validate(msg))
    else:
        # Broadcast to all customers — for simplicity return placeholder
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Broadcast notifications not yet implemented",
        )


@admin_router.get("/delivery/{message_id}", response_model=APIResponse[list[NotificationDeliveryLogOut]])
async def get_delivery_logs(
    db: DBDependency,
    admin: CurrentAdmin,
    message_id: int,
):
    """Get delivery logs for a notification message."""
    result = await db.execute(
        select(NotificationDeliveryLog).where(NotificationDeliveryLog.message_id == message_id)
    )
    logs = result.scalars().all()
    return APIResponse(data=[NotificationDeliveryLogOut.model_validate(l) for l in logs])


@admin_router.get("/{message_id}", response_model=APIResponse[NotificationMessageOut])
async def get_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    message_id: int,
):
    """Get notification detail."""
    result = await db.execute(select(NotificationMessage).where(NotificationMessage.id == message_id))
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return APIResponse(data=NotificationMessageOut.model_validate(msg))


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@public_router.get("/me", response_model=APIResponse[PaginatedResponse[NotificationMessageOut]])
async def list_my_notifications(
    customer: ActiveCustomer,
    db: DBDependency,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List current customer's notifications."""
    count_stmt = select(func.count(NotificationMessage.id)).where(
        NotificationMessage.customer_id == customer.id
    )
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(NotificationMessage)
        .where(NotificationMessage.customer_id == customer.id)
        .order_by(NotificationMessage.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [NotificationMessageOut.model_validate(n) for n in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_router.patch("/me/{message_id}/read", response_model=APIResponse[NotificationMessageOut])
async def mark_notification_read(
    customer: ActiveCustomer,
    db: DBDependency,
    message_id: int,
):
    """Mark a notification as read."""
    result = await db.execute(
        select(NotificationMessage).where(
            NotificationMessage.id == message_id,
            NotificationMessage.customer_id == customer.id,
        )
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    msg.is_read = True
    msg.read_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return APIResponse(data=NotificationMessageOut.model_validate(msg))


@public_router.get("/preferences/me", response_model=APIResponse[list[NotificationPreferenceOut]])
async def get_my_preferences(
    customer: ActiveCustomer,
    db: DBDependency,
):
    """Get current customer's notification preferences."""
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.customer_id == customer.id)
    )
    prefs = result.scalars().all()
    return APIResponse(data=[NotificationPreferenceOut.model_validate(p) for p in prefs])


@public_router.put("/preferences/me", response_model=APIResponse[list[NotificationPreferenceOut]])
async def update_my_preferences(
    customer: ActiveCustomer,
    db: DBDependency,
    data: list[NotificationPreferenceUpdate],
):
    """Update current customer's notification preferences."""
    # For simplicity, update all existing preferences or create defaults if none exist.
    # A more robust implementation would match by channel/category.
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.customer_id == customer.id)
    )
    existing = {f"{p.channel}:{p.message_category}": p for p in result.scalars().all()}

    updated = []
    for pref_update in data:
        # Find or create a preference entry
        key = None
        for k, v in existing.items():
            key = k
            break
        if key and key in existing:
            pref = existing[key]
            update_data = pref_update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(pref, field, value)
            pref.updated_at = datetime.now(timezone.utc)
            updated.append(pref)
        else:
            # Create a generic preference if none exist
            new_pref = NotificationPreference(
                customer_id=customer.id,
                channel="push_notification",
                message_category="all",
                is_enabled=pref_update.is_enabled if pref_update.is_enabled is not None else True,
                quiet_hours_start=pref_update.quiet_hours_start,
                quiet_hours_end=pref_update.quiet_hours_end,
                timezone=pref_update.timezone or "UTC",
            )
            db.add(new_pref)
            updated.append(new_pref)

    await db.commit()
    for pref in updated:
        await db.refresh(pref)

    return APIResponse(data=[NotificationPreferenceOut.model_validate(p) for p in updated])
