from datetime import timezone, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete

from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_store_access
from app.core.audit import log_action
from app.models.user import User, UserRole
from app.models.staff import Staff, StaffShift, StaffRole, PinAttempt

router = APIRouter()

PIN_MAX_ATTEMPTS = 5
PIN_WINDOW_MINUTES = 5


async def _check_pin_rate_limit(staff_id: int, db: AsyncSession):
    """Database-backed PIN rate limit: max 5 attempts per 5 minutes per staff member."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PIN_WINDOW_MINUTES)
    result = await db.execute(
        select(func.count()).select_from(PinAttempt).where(
            PinAttempt.staff_id == staff_id,
            PinAttempt.attempted_at >= cutoff,
        )
    )
    count = result.scalar() or 0
    if count >= PIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many PIN attempts. Try again after {PIN_WINDOW_MINUTES} minutes.",
        )


async def _record_pin_attempt(staff_id: int, db: AsyncSession):
    db.add(PinAttempt(staff_id=staff_id))
    await db.flush()
from app.schemas.admin_extras import (
    StaffCreate,
    StaffUpdate,
    StaffOut,
    StaffShiftOut,
    ClockInRequest,
)

router = APIRouter()


@router.get("/admin/stores/{store_id}/staff", response_model=list[StaffOut])
async def list_staff(
    store_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_store_access("store_id", allowed_staff_roles={"manager", "assistant_manager"})),
):
    result = await db.execute(
        select(Staff).where(Staff.store_id == store_id)
    )
    return result.scalars().all()


@router.post("/admin/stores/{store_id}/staff", response_model=StaffOut)
async def create_staff(
    store_id: int,
    data: StaffCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    obj = Staff(store_id=store_id, **data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    await log_action(db, action="STAFF_CREATED", user_id=user.id, store_id=store_id, entity_type="staff", entity_id=obj.id)
    await db.commit()
    return obj


@router.put("/admin/staff/{staff_id}", response_model=StaffOut)
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await log_action(db, action="STAFF_UPDATED", user_id=user.id, store_id=obj.store_id, entity_type="staff", entity_id=obj.id)
    await db.flush()
    await db.refresh(obj)
    await db.commit()
    return obj


@router.delete("/admin/staff/{staff_id}")
async def deactivate_staff(
    staff_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin)),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404)
    obj.is_active = False
    await log_action(db, action="STAFF_DEACTIVATED", user_id=user.id, store_id=obj.store_id, entity_type="staff", entity_id=obj.id)
    await db.flush()
    await db.commit()
    return {"detail": "Staff deactivated"}


@router.post("/admin/staff/{staff_id}/clock-in")
async def clock_in(
    staff_id: int,
    data: ClockInRequest,
    db: AsyncSession = Depends(get_db),
):
    await _check_pin_rate_limit(staff_id, db)
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(404)
    if staff.pin_code != data.pin_code:
        await _record_pin_attempt(staff_id, db)
        raise HTTPException(status_code=400, detail="Invalid PIN")
    shift = StaffShift(
        staff_id=staff_id,
        store_id=staff.store_id,
        clock_in=datetime.now(timezone.utc),
    )
    db.add(shift)
    await db.flush()
    await db.refresh(shift)
    await db.commit()
    return {"detail": "Clocked in", "shift_id": shift.id}


@router.post("/admin/staff/{staff_id}/clock-out")
async def clock_out(
    staff_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StaffShift)
        .where(StaffShift.staff_id == staff_id, StaffShift.clock_out.is_(None))
        .order_by(desc(StaffShift.clock_in))
        .limit(1)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(404, detail="No active shift found")
    shift.clock_out = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    return {"detail": "Clocked out", "shift_id": shift.id}


@router.get("/admin/stores/{store_id}/shifts", response_model=list[StaffShiftOut])
async def list_shifts(
    store_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_store_access("store_id", allowed_staff_roles={"manager", "assistant_manager"})),
):
    result = await db.execute(
        select(StaffShift)
        .join(Staff, Staff.id == StaffShift.staff_id)
        .where(Staff.store_id == store_id)
        .order_by(desc(StaffShift.clock_in))
        .limit(100)
    )
    return result.scalars().all()
