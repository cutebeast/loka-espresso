from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.staff import Staff, StaffShift, StaffRole
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
    user: User = Depends(require_role(UserRole.admin, UserRole.store_owner)),
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
    await db.flush()
    await db.commit()
    return {"detail": "Staff deactivated"}


@router.post("/admin/staff/{staff_id}/clock-in")
async def clock_in(
    staff_id: int,
    data: ClockInRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    staff = result.scalar_one_or_none()
    if not staff:
        raise HTTPException(404)
    if staff.pin != data.pin:
        raise HTTPException(status_code=400, detail="Invalid PIN")
    shift = StaffShift(
        staff_id=staff_id,
        clock_in=datetime.utcnow(),
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
    shift.clock_out = datetime.utcnow()
    await db.flush()
    await db.commit()
    return {"detail": "Clocked out", "shift_id": shift.id}


@router.get("/admin/stores/{store_id}/shifts", response_model=list[StaffShiftOut])
async def list_shifts(
    store_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin, UserRole.store_owner)),
):
    result = await db.execute(
        select(StaffShift)
        .join(Staff, Staff.id == StaffShift.staff_id)
        .where(Staff.store_id == store_id)
        .order_by(desc(StaffShift.clock_in))
        .limit(100)
    )
    return result.scalars().all()
