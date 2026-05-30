"""Public Event RSVP endpoints."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import ActiveCustomer, DBDependency
from app.models.info_card import EventCard, EventRsvp
from app.schemas.base import APIResponse

router = APIRouter(prefix="/events", tags=["public — events"])


@router.post("/{event_id}/rsvp", response_model=APIResponse[dict])
async def rsvp_to_event(
    db: DBDependency,
    customer: ActiveCustomer,
    event_id: int,
):
    """RSVP to an event. Increments the event's rsvp_count if successful."""
    result = await db.execute(
        select(EventCard).where(EventCard.id == event_id).with_for_update()
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if not event.rsvp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="RSVP is not enabled for this event",
        )

    if not event.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is no longer active",
        )

    # Check capacity
    if event.rsvp_max_capacity is not None and event.rsvp_count >= event.rsvp_max_capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event has reached maximum RSVP capacity",
        )

    # Check duplicate RSVP
    dup = await db.execute(
        select(EventRsvp).where(
            EventRsvp.event_id == event_id,
            EventRsvp.customer_id == customer.id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already RSVP'd to this event",
        )

    rsvp = EventRsvp(event_id=event_id, customer_id=customer.id)
    db.add(rsvp)
    event.rsvp_count += 1
    await db.commit()

    return APIResponse(data={
        "id": rsvp.id,
        "event_id": event_id,
        "rsvp_count": event.rsvp_count,
        "message": "RSVP confirmed",
    })


@router.get("/rsvps/me", response_model=APIResponse[dict])
async def list_my_rsvps(db: DBDependency, customer: ActiveCustomer):
    """List all events the current customer has RSVP'd to."""
    result = await db.execute(
        select(EventRsvp, EventCard)
        .join(EventCard, EventRsvp.event_id == EventCard.id)
        .where(EventRsvp.customer_id == customer.id)
        .order_by(EventRsvp.created_at.desc())
    )
    items = []
    for rsvp, event in result.all():
        items.append({
            "rsvp_id": rsvp.id,
            "event_id": event.id,
            "title": event.title,
            "event_datetime": event.event_datetime.isoformat() if event.event_datetime else None,
            "location": event.location,
            "image_url": event.image_url,
            "slug": event.slug,
            "rsvp_count": event.rsvp_count,
            "rsvped_at": rsvp.created_at.isoformat() if rsvp.created_at else None,
        })
    return APIResponse(data={"items": items, "total": len(items)})
