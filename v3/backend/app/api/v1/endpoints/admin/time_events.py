"""Staff time event endpoints (admin + staff-facing)."""

from datetime import date, datetime, time, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency, security_scheme
from app.core.security import decode_token
from app.models.iam import AdminAccount
from app.models.staff import StaffProfile, StaffTimeEvent
from app.schemas.base import APIResponse, PaginatedResponse


async def get_current_staff(
    db: DBDependency,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> StaffProfile:
    """Dependency to get the currently authenticated staff member."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_type = payload.get("type")
    if token_type not in ("access", "staff"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_staff_id = payload.get("staff_id")
    staff_id = int(raw_staff_id) if raw_staff_id is not None else int(payload.get("sub", 0))

    # Admin users on staff portal have staff_id=0 — look up or create a StaffProfile
    if staff_id == 0:
        admin_id = payload.get("admin_id")
        if admin_id:
            admin_result = await db.execute(
                select(AdminAccount).where(AdminAccount.id == int(admin_id))
            )
            admin = admin_result.scalar_one_or_none()
            if admin:
                # Try to find existing staff profile by principal_id
                sp_result = await db.execute(
                    select(StaffProfile).where(
                        StaffProfile.principal_id == admin.principal_id,
                        StaffProfile.deleted_at.is_(None),
                    )
                )
                sp = sp_result.scalar_one_or_none()
                if sp:
                    return sp
                # Create a shadow StaffProfile for the admin
                sp = StaffProfile(
                    principal_id=admin.principal_id,
                    store_id=int(payload.get("store_id", 0)),
                    employee_id=f"ADMIN-{admin.id}",
                    display_name=admin.display_name,
                    email_address=admin.email,
                    role="shift_supervisor",
                    is_active=True,
                )
                db.add(sp)
                await db.commit()
                await db.refresh(sp)
                return sp
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin staff profile not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account is inactive",
        )

    return staff


CurrentStaff = Annotated[StaffProfile, Depends(get_current_staff)]

# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class TimeEventBase(BaseModel):
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


class TimeEventVerify(BaseModel):
    approved: bool = True
    notes: str | None = Field(None, max_length=255)


class TimeEventOut(BaseModel):
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
        base_stmt = base_stmt.where(StaffTimeEvent.event_type == event_type)
        count_stmt = count_stmt.where(StaffTimeEvent.event_type == event_type)
    if date_from is not None:
        dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
    if date_to is not None:
        dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
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
    items = [TimeEventOut.model_validate(r) for r in result.scalars().all()]

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
    # Verify staff exists
    staff_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == data.staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    if staff_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

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
        base_stmt = base_stmt.where(StaffTimeEvent.event_type == event_type)
        count_stmt = count_stmt.where(StaffTimeEvent.event_type == event_type)
    if date_from is not None:
        dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
        count_stmt = count_stmt.where(StaffTimeEvent.event_timestamp >= dt_from)
    if date_to is not None:
        dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
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
    items = [TimeEventOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )
