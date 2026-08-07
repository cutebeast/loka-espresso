"""Admin event cards endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.info_card import EventCard, EventInvite, EventRsvp
from app.schemas.content import EventCardCreate, EventCardOut, EventCardUpdate, EventInviteAdd
from app.services.translation import auto_translate_record, schedule_auto_translate, delete_translations
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/event-cards", tags=["admin — event cards"])


@router.get("", response_model=APIResponse[PaginatedResponse[EventCardOut]])
async def list_items(db: DBDependency, admin: CurrentAdmin, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500)):
    base = select(EventCard)
    cnt = select(func.count(EventCard.id))
    total = (await db.execute(cnt)).scalar() or 0
    result = await db.execute(base.order_by(EventCard.id.desc()).offset((page-1)*per_page).limit(per_page))
    items = []
    for r in result.scalars().all():
        d = {}
        for c in r.__table__.columns.keys():
            v = getattr(r, c)
            if isinstance(v, datetime): d[c] = v.isoformat()
            else: d[c] = v
        items.append(d)
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page, total_pages=(total+per_page-1)//per_page if per_page else 0))

@router.get("/{id}", response_model=APIResponse[EventCardOut])
async def get_item(db: DBDependency, admin: CurrentAdmin, id: int):
    from app.models.info_card import EventCard
    result = await db.execute(select(EventCard).where(EventCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    d = {c: getattr(item, c) for c in item.__table__.columns.keys()}
    for k in ["created_at","updated_at","start_date","end_date","event_datetime"]:
        v = getattr(item, k, None)
        if v: d[k] = v.isoformat()
    return APIResponse(data=d)

@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_item(db: DBDependency, admin: CurrentAdmin, data: EventCardCreate):
    create_data = data.model_dump(exclude_unset=True)
    if not create_data.get("slug") and data.title:
        create_data["slug"] = data.title.lower().replace(" ", "-")[:50]
    item = EventCard(**create_data)
    db.add(item); await db.commit(); await db.refresh(item)
    schedule_auto_translate("event_cards", item.id, {"title": data.title or "", "short_description": data.short_description or "", "long_description": data.long_description or ""})
    return APIResponse(data={"id": item.id, "message": "Created"})


@router.patch("/{id}", response_model=APIResponse[dict])
async def update_item(db: DBDependency, admin: CurrentAdmin, id: int, data: EventCardUpdate):
    result = await db.execute(select(EventCard).where(EventCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    setattr(item, "updated_at", datetime.now(timezone.utc))
    await db.commit()
    schedule_auto_translate("event_cards", id, {"title": data.title or "", "short_description": data.short_description or "", "long_description": data.long_description or ""})
    return APIResponse(data={"id": item.id, "message": "Updated"})


@router.delete("/{id}", response_model=APIResponse[dict])
async def delete_item(db: DBDependency, admin: CurrentAdmin, id: int):
    result = await db.execute(select(EventCard).where(EventCard.id == id))
    item = result.scalar_one_or_none()
    if not item: raise HTTPException(404, "Not found")
    await db.delete(item); await db.commit()
    await delete_translations(db, "event_cards", id)
    return APIResponse(data={"id": id, "deleted": True})


# ── RSVP attendees ──

@router.get("/{id}/attendees", response_model=APIResponse[dict])
async def list_attendees(db: DBDependency, admin: CurrentAdmin, id: int):
    """List customers who RSVP'd to an event (all event types)."""
    result = await db.execute(
        select(EventRsvp, Customer)
        .join(Customer, EventRsvp.customer_id == Customer.id)
        .where(EventRsvp.event_id == id)
        .order_by(EventRsvp.created_at.desc())
    )
    items = [
        {
            "rsvp_id": rsvp.id,
            "customer_id": cust.id,
            "display_name": cust.display_name or " ".join(filter(None, [cust.given_name, cust.family_name])) or None,
            "phone_number": cust.phone_number,
            "email_address": cust.email_address,
            "customer_segment": cust.customer_segment,
            "rsvped_at": rsvp.created_at.isoformat() if rsvp.created_at else None,
        }
        for rsvp, cust in result.all()
    ]
    return APIResponse(data={"items": items, "total": len(items)})


# ── Invite list (invite_only events) ──

@router.get("/{id}/invites", response_model=APIResponse[dict])
async def list_invites(db: DBDependency, admin: CurrentAdmin, id: int):
    """List invited customers for an event, with RSVP status per invitee."""
    result = await db.execute(
        select(EventInvite, Customer, EventRsvp.id)
        .join(Customer, EventInvite.customer_id == Customer.id)
        .outerjoin(
            EventRsvp,
            (EventRsvp.event_id == EventInvite.event_id)
            & (EventRsvp.customer_id == EventInvite.customer_id),
        )
        .where(EventInvite.event_id == id)
        .order_by(EventInvite.created_at.desc())
    )
    items = [
        {
            "invite_id": inv.id,
            "customer_id": cust.id,
            "display_name": cust.display_name or " ".join(filter(None, [cust.given_name, cust.family_name])) or None,
            "phone_number": cust.phone_number,
            "email_address": cust.email_address,
            "customer_segment": cust.customer_segment,
            "invited_at": inv.created_at.isoformat() if inv.created_at else None,
            "rsvped": rsvp_id is not None,
        }
        for inv, cust, rsvp_id in result.all()
    ]
    return APIResponse(data={"items": items, "total": len(items)})


@router.post("/{id}/invites", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def add_invite(db: DBDependency, admin: CurrentAdmin, id: int, data: EventInviteAdd):
    event = (await db.execute(select(EventCard).where(EventCard.id == id))).scalar_one_or_none()
    if not event: raise HTTPException(404, "Event not found")
    customer = (await db.execute(select(Customer).where(Customer.id == data.customer_id))).scalar_one_or_none()
    if not customer: raise HTTPException(404, "Customer not found")
    dup = await db.execute(
        select(EventInvite).where(EventInvite.event_id == id, EventInvite.customer_id == data.customer_id)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Customer already invited")
    invite = EventInvite(event_id=id, customer_id=data.customer_id)
    db.add(invite); await db.commit(); await db.refresh(invite)
    return APIResponse(data={"id": invite.id, "message": "Invited"})


@router.delete("/{id}/invites/{customer_id}", response_model=APIResponse[dict])
async def remove_invite(db: DBDependency, admin: CurrentAdmin, id: int, customer_id: int):
    result = await db.execute(
        select(EventInvite).where(EventInvite.event_id == id, EventInvite.customer_id == customer_id)
    )
    invite = result.scalar_one_or_none()
    if not invite: raise HTTPException(404, "Invite not found")
    await db.delete(invite); await db.commit()
    return APIResponse(data={"deleted": True})
