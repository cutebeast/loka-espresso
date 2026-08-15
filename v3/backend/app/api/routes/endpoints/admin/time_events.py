"""Staff time event endpoints (admin + staff-facing)."""

from datetime import date, datetime, time, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.business_time import day_start_utc, day_end_utc
from app.api.routes.deps import CurrentAdmin, DBDependency, CurrentStaff, require_store_admin
from app.models.staff import StaffProfile, StaffTimeEvent
from app.schemas.base import APIResponse, PaginatedResponse, BaseSchema


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class TimeEventBase(BaseSchema):
    staff_id: int
    store_id: int
    event_type: Literal["clock_in", "clock_out", "break_start", "break_end", "overtime_start"]
    event_timestamp: datetime | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    device_info: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=255)


class TimeEventCreate(TimeEventBase):
    pass


class TimeEventVerify(BaseSchema):
    approved: bool = True
    notes: str | None = Field(None, max_length=255)


class TimeEventOut(BaseSchema):
    model_config = {"from_attributes": True}

    id: int
    staff_id: int
    store_id: int
    event_type: str
    event_timestamp: datetime
    latitude: float | None
    longitude: float | None
    location_verified: bool
    device_info: str | None
    notes: str | None
    approved_by: int | None
    created_at: datetime
    staff_name: str | None = None


# ---------------------------------------------------------------------------
# Admin router
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/staff", tags=["admin — staff"])


@admin_router.get("/time-events", response_model=APIResponse[PaginatedResponse[TimeEventOut]])
async def list_time_events(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    staff_id: int | None = Query(None),
    event_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List staff time events with filters."""
    base_stmt = select(StaffTimeEvent)
    count_stmt = select(func.count(StaffTimeEvent.id))

    if store_id is not None:
        base_stmt = base_stmt.where(StaffTimeEvent.store_id == store_id)
        count_stmt = count_stmt.where(StaffTimeEvent.store_id == store_id)
    if staff_id is not None:
        base_stmt = base_stmt.where(StaffTimeEvent.staff_id == staff_id)
        count_stmt = count_stmt.where(StaffTimeEvent.staff_id == staff_id)
    if event_type is not None:
        # Native PG enum shift_event_type — validate before the cast (500s otherwise)
        _valid_event_types = {"clock_in", "clock_out", "break_start", "break_end", "overtime_start"}
        if event_type not in _valid_event_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid event_type '{event_type}' — use {', '.join(sorted(_valid_event_types))}",
            )
        base_stmt = base_stmt.where(StaffTimeEvent.event_type == event_type)
        count_stmt = count_stmt.where(StaffTimeEvent.event_type == event_type)
    if date_from is not None:
        dt_from = day_start_utc(date_from)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
    if date_to is not None:
        dt_to = day_end_utc(date_to)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp <= dt_to)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp <= dt_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(StaffTimeEvent.event_timestamp.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [TimeEventOut.model_validate(r) for r in rows]

    # Enrich with staff display names (list view has no join)
    if rows:
        from app.models.staff import StaffProfile
        name_rows = await db.execute(
            select(StaffProfile.id, StaffProfile.display_name).where(
                StaffProfile.id.in_({r.staff_id for r in rows})
            )
        )
        name_map = {r[0]: r[1] for r in name_rows.all()}
        for item, ev in zip(items, rows):
            item.staff_name = name_map.get(ev.staff_id)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@admin_router.post(
    "/time-events",
    response_model=APIResponse[TimeEventOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_time_event(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TimeEventCreate,
):
    """Create a time event (admin or manager)."""
    await require_store_admin(db, admin, data.store_id)

    # Verify staff exists and belongs to the event's store
    staff_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == data.staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    staff_profile = staff_result.scalar_one_or_none()
    if staff_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    if staff_profile.store_id != data.store_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Staff member does not belong to this store")

    event_data = data.model_dump(exclude_unset=True)
    if event_data.get("event_timestamp") is None:
        event_data["event_timestamp"] = datetime.now(timezone.utc)

    event = StaffTimeEvent(**event_data)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return APIResponse(data=TimeEventOut.model_validate(event))


@admin_router.get("/time-events/{id}", response_model=APIResponse[TimeEventOut])
async def get_time_event(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a single time event by ID."""
    result = await db.execute(
        select(StaffTimeEvent).where(StaffTimeEvent.id == id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time event not found")
    return APIResponse(data=TimeEventOut.model_validate(event))


@admin_router.patch("/time-events/{id}/verify", response_model=APIResponse[TimeEventOut])
async def verify_time_event(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: TimeEventVerify,
):
    """Manager verifies a time event."""
    result = await db.execute(
        select(StaffTimeEvent).where(StaffTimeEvent.id == id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time event not found")

    await require_store_admin(db, admin, event.store_id)

    if data.approved:
        event.approved_by = admin.id
    else:
        event.approved_by = None

    if data.notes is not None:
        event.notes = data.notes

    await db.commit()
    await db.refresh(event)
    return APIResponse(data=TimeEventOut.model_validate(event))


# ---------------------------------------------------------------------------
# Staff-facing router
# ---------------------------------------------------------------------------

staff_router = APIRouter(prefix="/staff", tags=["staff"])


@staff_router.post(
    "/time-events",
    response_model=APIResponse[TimeEventOut],
    status_code=status.HTTP_201_CREATED,
)
async def staff_clock_event(
    db: DBDependency,
    staff: CurrentStaff,
    event_type: Literal["clock_in", "clock_out", "break_start", "break_end", "overtime_start"],
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    device_info: str | None = Query(None, max_length=255),
    notes: str | None = Query(None, max_length=255),
):
    """Staff clocks in/out or records a break/overtime event."""
    if staff.id == 0:
        raise HTTPException(status_code=403, detail="Admin users cannot clock in/out. Use the admin portal for time audits.")

    # State machine: derive the current shift state from the latest event and
    # reject impossible transitions (double clock-in, break without an open
    # shift, break_end without a break, ...). Without this, mis-taps and
    # double-taps write garbage sequences that break payroll math.
    last_result = await db.execute(
        select(StaffTimeEvent)
        .where(StaffTimeEvent.staff_id == staff.id)
        .order_by(StaffTimeEvent.event_timestamp.desc(), StaffTimeEvent.id.desc())
        .limit(1)
    )
    last = last_result.scalar_one_or_none()
    current_state = "out"
    if last is not None:
        current_state = {
            "clock_in": "in",
            "break_start": "break",
            "break_end": "in",
            "overtime_start": "in",
        }.get(last.event_type, "out")
    ALLOWED = {
        "clock_in": {"out"},
        "clock_out": {"in", "break"},
        "break_start": {"in"},
        "break_end": {"break"},
        "overtime_start": {"in"},
    }
    if current_state not in ALLOWED[event_type]:
        state_label = {"out": "not clocked in", "in": "already clocked in", "break": "on break"}[current_state]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot record '{event_type}' while {state_label}",
        )

    event = StaffTimeEvent(
        staff_id=staff.id,
        store_id=staff.store_id,
        event_type=event_type,
        event_timestamp=datetime.now(timezone.utc),
        latitude=latitude,
        longitude=longitude,
        device_info=device_info,
        notes=notes,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return APIResponse(data=TimeEventOut.model_validate(event))


@staff_router.get("/time-events/me", response_model=APIResponse[PaginatedResponse[TimeEventOut]])
async def staff_list_my_time_events(
    db: DBDependency,
    staff: CurrentStaff,
    event_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """Get current staff's time events."""
    base_stmt = select(StaffTimeEvent).where(StaffTimeEvent.staff_id == staff.id)
    count_stmt = select(func.count(StaffTimeEvent.id)).where(StaffTimeEvent.staff_id == staff.id)

    if event_type is not None:
        # Native PG enum shift_event_type — validate before the cast (500s otherwise)
        _valid_event_types = {"clock_in", "clock_out", "break_start", "break_end", "overtime_start"}
        if event_type not in _valid_event_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid event_type '{event_type}' — use {', '.join(sorted(_valid_event_types))}",
            )
        base_stmt = base_stmt.where(StaffTimeEvent.event_type == event_type)
        count_stmt = count_stmt.where(StaffTimeEvent.event_type == event_type)
    if date_from is not None:
        dt_from = day_start_utc(date_from)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
    if date_to is not None:
        dt_to = day_end_utc(date_to)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp <= dt_to)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp <= dt_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(StaffTimeEvent.event_timestamp.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [TimeEventOut.model_validate(r) for r in rows]

    # Enrich with staff display names (list view has no join)
    if rows:
        from app.models.staff import StaffProfile
        name_rows = await db.execute(
            select(StaffProfile.id, StaffProfile.display_name).where(
                StaffProfile.id.in_({r.staff_id for r in rows})
            )
        )
        name_map = {r[0]: r[1] for r in name_rows.all()}
        for item, ev in zip(items, rows):
            item.staff_name = name_map.get(ev.staff_id)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
