"""Admin and public notification endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency, OptionalLocale
from app.services.translation import merge_translations, translate_single
from app.models.customer import Customer
from app.models.info_card import EventCard, EventRsvp
from app.models.loyalty import LoyaltyAccount, LoyaltyTier
from app.models.notification import (
    AdminNotification,
    NotificationDeliveryLog,
    NotificationMessage,
    NotificationPreference,
    NotificationTemplate,
)
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.notification import (
    AdminNotificationCreate,
    AdminNotificationOut,
    AdminNotificationUpdate,
    NotificationDeliveryLogOut,
    NotificationMessageOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    NotificationTemplateCreate,
    NotificationTemplateOut,
    NotificationTemplateUpdate,
)

from app.services.translation import auto_translate_record, delete_translations

admin_router = APIRouter(prefix="/admin/notifications", tags=["admin — notifications"])
public_router = APIRouter(prefix="/notifications", tags=["notifications"])

AUDIENCE_LABEL = {
    "all_users": "All Users",
    "new_users": "New Users",
    "loyal_customers": "Loyal Customers",
    "inactive_users": "Inactive Users",
    "platinum_members": "Platinum Members",
}

NOTIFICATION_TYPE_LABEL = {
    "general": "General",
    "order": "Order",
    "reward": "Reward",
    "wallet": "Wallet",
    "loyalty": "Loyalty",
    "promo": "Promo",
    "info": "Info",
    "event": "Event",
}


# ---------------------------------------------------------------------------
# Admin Push Notifications (audience-targeted)
# ---------------------------------------------------------------------------

@admin_router.get("", response_model=APIResponse[PaginatedResponse[AdminNotificationOut]])
async def list_admin_notifications(
    db: DBDependency,
    admin: CurrentAdmin,
    is_archived: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """List admin push notifications with filters."""
    base = select(AdminNotification)
    cnt = select(func.count(AdminNotification.id))

    if is_archived is not None:
        base = base.where(AdminNotification.is_archived.is_(is_archived))
        cnt = cnt.where(AdminNotification.is_archived.is_(is_archived))
    if from_date:
        base = base.where(AdminNotification.created_at >= from_date)
        cnt = cnt.where(AdminNotification.created_at >= from_date)
    if to_date:
        base = base.where(AdminNotification.created_at <= to_date)
        cnt = cnt.where(AdminNotification.created_at <= to_date)

    total_result = await db.execute(cnt)
    total = total_result.scalar() or 0

    stmt = base.order_by(AdminNotification.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [AdminNotificationOut.model_validate(n) for n in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items, total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.get("/stats", response_model=APIResponse[dict])
async def get_notification_stats(db: DBDependency, admin: CurrentAdmin):
    r1 = await db.execute(select(func.count(AdminNotification.id)).where(AdminNotification.status == "sent"))
    r2 = await db.execute(select(func.count(AdminNotification.id)).where(AdminNotification.status == "draft"))
    r3 = await db.execute(select(func.count(AdminNotification.id)).where(AdminNotification.status == "scheduled"))
    sent = r1.scalar() or 0
    return APIResponse(data={"total_sent": sent, "total_delivered": sent, "total_failed": 0, "total_draft": (r2.scalar() or 0) + (r3.scalar() or 0)})


@admin_router.post("", response_model=APIResponse[AdminNotificationOut], status_code=status.HTTP_201_CREATED)
async def create_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    data: AdminNotificationCreate,
):
    """Create a new push notification (draft or scheduled)."""
    notif = AdminNotification(**data.model_dump(), created_by=admin.id)
    db.add(notif)
    await db.commit()
    await auto_translate_record(db, "admin_notifications", notif.id, {"title": notif.title or "", "body": notif.body or ""})
    await db.refresh(notif)
    return APIResponse(data=AdminNotificationOut.model_validate(notif))


@admin_router.get("/templates/list", response_model=APIResponse[PaginatedResponse[NotificationTemplateOut]])
async def list_templates(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List all notification templates."""
    total_result = await db.execute(select(func.count(NotificationTemplate.id)))
    total = total_result.scalar() or 0
    result = await db.execute(
        select(NotificationTemplate)
        .order_by(NotificationTemplate.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    templates = result.scalars().all()
    return APIResponse(
        data=PaginatedResponse(
            items=[NotificationTemplateOut.model_validate(t) for t in templates],
            total=total, page=page, per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post("/templates", response_model=APIResponse[NotificationTemplateOut], status_code=status.HTTP_201_CREATED)
async def create_template(
    db: DBDependency,
    admin: CurrentAdmin,
    data: NotificationTemplateCreate,
):
    """Create a notification template."""
    tmpl = NotificationTemplate(**data.model_dump())
    db.add(tmpl)
    await db.commit()
    await auto_translate_record(db, "notification_templates", tmpl.id, {"title": tmpl.title or "", "body": tmpl.body or ""})
    await db.refresh(tmpl)
    return APIResponse(data=NotificationTemplateOut.model_validate(tmpl))


@admin_router.get("/{notif_id}", response_model=APIResponse[AdminNotificationOut])
async def get_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    notif_id: int,
):
    """Get a single admin notification."""
    result = await db.execute(select(AdminNotification).where(AdminNotification.id == notif_id))
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return APIResponse(data=AdminNotificationOut.model_validate(notif))


@admin_router.put("/{notif_id}", response_model=APIResponse[AdminNotificationOut])
async def update_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    notif_id: int,
    data: AdminNotificationUpdate,
):
    """Update an existing notification."""
    result = await db.execute(select(AdminNotification).where(AdminNotification.id == notif_id))
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(notif, field, value)
    notif.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "admin_notifications", notif.id, {"title": notif.title or "", "body": notif.body or ""})
    await db.refresh(notif)
    return APIResponse(data=AdminNotificationOut.model_validate(notif))


@admin_router.delete("/{notif_id}", response_model=APIResponse[dict])
async def delete_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    notif_id: int,
):
    """Delete a notification."""
    result = await db.execute(select(AdminNotification).where(AdminNotification.id == notif_id))
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await db.delete(notif)
    await db.commit()
    await delete_translations(db, "admin_notifications", notif_id)
    return APIResponse(data={"id": notif_id, "deleted": True})


@admin_router.patch("/{notif_id}/archive", response_model=APIResponse[AdminNotificationOut])
async def toggle_archive(
    db: DBDependency,
    admin: CurrentAdmin,
    notif_id: int,
):
    """Toggle archive status of a notification."""
    result = await db.execute(select(AdminNotification).where(AdminNotification.id == notif_id))
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notif.is_archived = not notif.is_archived
    await db.commit()
    await db.refresh(notif)
    return APIResponse(data=AdminNotificationOut.model_validate(notif))


@admin_router.post("/{notif_id}/send", response_model=APIResponse[AdminNotificationOut])
async def send_notification(
    db: DBDependency,
    admin: CurrentAdmin,
    notif_id: int,
):
    """Send a notification to its audience segment."""
    from datetime import timedelta

    result = await db.execute(select(AdminNotification).where(AdminNotification.id == notif_id))
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    # Build audience query based on segment
    customer_stmt = select(Customer.id).where(
        Customer.is_active.is_(True),
        Customer.deleted_at.is_(None),
    )

    now = datetime.now(timezone.utc)

    if notif.audience_segment == "new_users":
        # Registered within last 30 days
        customer_stmt = customer_stmt.where(
            Customer.created_at >= now - timedelta(days=30)
        )
    elif notif.audience_segment == "loyal_customers":
        # Customers with 5+ orders
        customer_stmt = customer_stmt.where(Customer.order_count >= 5)
    elif notif.audience_segment == "inactive_users":
        # No order in last 60 days, or never ordered
        customer_stmt = customer_stmt.where(
            (Customer.last_order_at.is_(None))
            | (Customer.last_order_at < now - timedelta(days=60))
        )
    elif notif.audience_segment == "platinum_members":
        # Top-tier loyalty members (highest sort_order tier)
        top_tier_result = await db.execute(
            select(LoyaltyTier.id).where(
                LoyaltyTier.is_active.is_(True)
            ).order_by(LoyaltyTier.sort_order.desc()).limit(1)
        )
        top_tier_id = top_tier_result.scalar_one_or_none()
        if top_tier_id:
            customer_stmt = customer_stmt.join(
                LoyaltyAccount, LoyaltyAccount.customer_id == Customer.id
            ).where(LoyaltyAccount.current_tier_id == top_tier_id)
        # else: no tiers configured, send to no one
    elif notif.audience_segment.startswith("tier:"):
        # Dynamic per-tier segment — resolve against loyalty_tiers.tier_key
        tier_key = notif.audience_segment[len("tier:"):]
        tier_result = await db.execute(
            select(LoyaltyTier.id).where(
                LoyaltyTier.tier_key == tier_key,
                LoyaltyTier.is_active.is_(True),
            )
        )
        tier_id = tier_result.scalar_one_or_none()
        if tier_id is None:
            raise HTTPException(status_code=400, detail=f"Unknown or inactive loyalty tier: {tier_key}")
        customer_stmt = customer_stmt.join(
            LoyaltyAccount, LoyaltyAccount.customer_id == Customer.id
        ).where(LoyaltyAccount.current_tier_id == tier_id)

    elif notif.audience_segment.startswith("event:"):
        # Dynamic per-event segment — customers who RSVP'd to the event card
        try:
            event_id = int(notif.audience_segment[len("event:"):])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid event segment: {notif.audience_segment}")
        event_exists = await db.execute(
            select(EventCard.id).where(EventCard.id == event_id)
        )
        if event_exists.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail=f"Unknown event card: {event_id}")
        customer_stmt = customer_stmt.join(
            EventRsvp, EventRsvp.customer_id == Customer.id
        ).where(EventRsvp.event_id == event_id)

    # Fetch matching customer IDs
    cust_result = await db.execute(customer_stmt)
    customer_ids = [row[0] for row in cust_result.all()]

    # Map admin notification_type to message_type (for check constraint)
    type_map = {
        "general": "system",
        "order": "order_update",
        "reward": "promotion",
        "wallet": "payment",
        "loyalty": "loyalty",
        "promo": "promotion",
        "info": "system",
        "event": "promotion",
    }
    mapped_type = type_map.get(notif.notification_type, "system")

    # Create NotificationMessage for each matched customer
    created_count = 0
    message_ids: dict[int, int] = {}  # customer_id -> message_id (for delivery logs)
    for cid in customer_ids:
        msg = NotificationMessage(
            customer_id=cid,
            message_type=mapped_type,
            priority="normal",
            title=notif.title,
            body=notif.body,
            image_url=notif.image_url,
            action_url=notif.action_url,
        )
        db.add(msg)
        await db.flush()
        message_ids[cid] = msg.id
        created_count += 1

    # ── Channel fan-out (push / sms / whatsapp) ──
    channel_stats = await _fan_out_channels(db, notif, customer_ids, message_ids)

    notif.status = "sent"
    notif.sent_at = now
    await db.commit()
    await db.refresh(notif)

    # Log delivery count in response
    out = AdminNotificationOut.model_validate(notif)
    out.delivered_count = created_count
    out.channel_stats = channel_stats or None
    return APIResponse(data=out)


async def _fan_out_channels(
    db, notif: AdminNotification, customer_ids: list[int], message_ids: dict[int, int]
) -> dict:
    """Deliver a sent admin notification over its extra channels
    (push_notification / sms / whatsapp) and log every attempt to
    notification_delivery_log. In-app inbox rows are created by the caller.

    Returns {channel: {"sent": n, "failed": n, "skipped": n}} — empty when no
    extra channels are configured on the notification.
    """
    extra = [c for c in (notif.channels or ["in_app"]) if c != "in_app"]
    if not extra or not customer_ids:
        return {}

    from app.models.customer import CustomerDevice
    from app.services.messaging import get_twilio_credentials, send_sms_via_twilio, send_whatsapp_via_twilio
    from app.services.web_push import send_web_push

    # Per-channel customer opt-outs (default: enabled when no preference row)
    pref_result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.customer_id.in_(customer_ids),
            NotificationPreference.channel.in_(extra),
        )
    )
    opted_out: set[tuple[int, str]] = {
        (p.customer_id, p.channel) for p in pref_result.scalars().all() if not p.is_enabled
    }

    phone_map: dict[int, str] = {}
    if "sms" in extra or "whatsapp" in extra:
        phone_result = await db.execute(
            select(Customer.id, Customer.phone_number)
            .where(Customer.id.in_(customer_ids))
            .where(Customer.phone_number.isnot(None))
            .where(Customer.phone_number != "")
        )
        phone_map = {row[0]: row[1] for row in phone_result.all()}

    devices: list[CustomerDevice] = []
    if "push_notification" in extra:
        dev_result = await db.execute(
            select(CustomerDevice).where(
                CustomerDevice.customer_id.in_(customer_ids),
                CustomerDevice.is_active.is_(True),
                CustomerDevice.deleted_at.is_(None),
                CustomerDevice.web_push_subscription.isnot(None),
            )
        )
        devices = [d for d in dev_result.scalars().all() if d.web_push_subscription]

    twilio_sid = twilio_token = sms_from = wa_from = ""
    if "sms" in extra or "whatsapp" in extra:
        twilio_sid, twilio_token, sms_from, wa_from = await get_twilio_credentials(db)

    now = datetime.now(timezone.utc)
    stats: dict[str, dict[str, int]] = {c: {"sent": 0, "failed": 0, "skipped": 0} for c in extra}

    def _log(message_id: int, channel: str, ok: bool, *, device_id=None, address=None, provider=None, error=None):
        db.add(NotificationDeliveryLog(
            message_id=message_id,
            channel=channel,
            device_id=device_id,
            recipient_address=address,
            status="sent" if ok else "failed",
            provider=provider,
            error_message=error,
            sent_at=now if ok else None,
        ))

    push_payload = {"title": notif.title, "body": notif.body or "", "url": notif.action_url or "/"}

    for cid in customer_ids:
        mid = message_ids[cid]

        if "push_notification" in extra:
            if (cid, "push_notification") in opted_out:
                stats["push_notification"]["skipped"] += 1
            else:
                cust_devices = [d for d in devices if d.customer_id == cid]
                if not cust_devices:
                    stats["push_notification"]["skipped"] += 1
                for dev in cust_devices:
                    result = send_web_push(dev.web_push_subscription, push_payload)
                    ok = bool(result.get("success"))
                    stats["push_notification"]["sent" if ok else "failed"] += 1
                    _log(mid, "push_notification", ok, device_id=dev.id,
                         address=str((dev.web_push_subscription or {}).get("endpoint", ""))[:255],
                         provider="webpush", error=None if ok else str(result.get("error", ""))[:500])

        if "sms" in extra:
            phone = phone_map.get(cid)
            if (cid, "sms") in opted_out or not phone or not (twilio_sid and twilio_token and sms_from):
                stats["sms"]["skipped"] += 1
            else:
                ok = await send_sms_via_twilio(twilio_sid, twilio_token, sms_from, phone, f"{notif.title}\n\n{notif.body or ''}", db=db)
                stats["sms"]["sent" if ok else "failed"] += 1
                _log(mid, "sms", ok, address=phone, provider="twilio")

        if "whatsapp" in extra:
            phone = phone_map.get(cid)
            if (cid, "whatsapp") in opted_out or not phone or not (twilio_sid and twilio_token and wa_from):
                stats["whatsapp"]["skipped"] += 1
            else:
                ok = await send_whatsapp_via_twilio(twilio_sid, twilio_token, wa_from, phone, f"{notif.title}\n\n{notif.body or ''}", db=db)
                stats["whatsapp"]["sent" if ok else "failed"] += 1
                _log(mid, "whatsapp", ok, address=phone, provider="twilio")

    return stats


# ---------------------------------------------------------------------------
# Notification Templates
# ---------------------------------------------------------------------------



@admin_router.put("/templates/{template_id}", response_model=APIResponse[NotificationTemplateOut])
async def update_template(
    db: DBDependency,
    admin: CurrentAdmin,
    template_id: int,
    data: NotificationTemplateUpdate,
):
    """Update a notification template."""
    result = await db.execute(select(NotificationTemplate).where(NotificationTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tmpl, field, value)
    tmpl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "notification_templates", tmpl.id, {"title": tmpl.title or "", "body": tmpl.body or ""})
    await db.refresh(tmpl)
    return APIResponse(data=NotificationTemplateOut.model_validate(tmpl))


@admin_router.delete("/templates/{template_id}", response_model=APIResponse[dict])
async def delete_template(
    db: DBDependency,
    admin: CurrentAdmin,
    template_id: int,
):
    """Delete a notification template."""
    result = await db.execute(select(NotificationTemplate).where(NotificationTemplate.id == template_id))
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()
    await delete_translations(db, "notification_templates", template_id)
    return APIResponse(data={"id": template_id, "deleted": True})


# ---------------------------------------------------------------------------
# Per-customer notification messages (existing — for reference/delivery logs)
# ---------------------------------------------------------------------------

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


@admin_router.get("/messages/{message_id}", response_model=APIResponse[NotificationMessageOut])
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
    locale: OptionalLocale,
    is_read: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List current customer's notifications, optionally filtered by read state."""
    count_stmt = select(func.count(NotificationMessage.id)).where(
        NotificationMessage.customer_id == customer.id
    )
    if is_read is not None:
        count_stmt = count_stmt.where(NotificationMessage.is_read.is_(is_read))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        select(NotificationMessage)
        .where(NotificationMessage.customer_id == customer.id)
        .order_by(NotificationMessage.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    if is_read is not None:
        stmt = stmt.where(NotificationMessage.is_read.is_(is_read))
    result = await db.execute(stmt)
    item_dicts = [NotificationMessageOut.model_validate(n).model_dump() for n in result.scalars().all()]
    await merge_translations(db, item_dicts, "admin_notifications", locale)

    return APIResponse(
        data=PaginatedResponse(
            items=item_dicts,
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
