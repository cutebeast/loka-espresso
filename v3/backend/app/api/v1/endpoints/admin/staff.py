"""Admin staff management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.iam import IAMPrincipal
from app.models.staff import StaffProfile, StaffShift
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.staff import (
    StaffProfileCreate,
    StaffProfileDetailOut,
    StaffProfileOut,
    StaffProfileUpdate,
    StaffShiftCreate,
    StaffShiftOut,
    StaffShiftUpdate,
)

router = APIRouter(prefix="/admin/staff", tags=["admin — staff"])


@router.get("", response_model=APIResponse[PaginatedResponse[StaffProfileOut]])
async def list_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List staff profiles for a store (paginated)."""
    base_stmt = (
        select(StaffProfile)
        .where(StaffProfile.store_id == store_id)
        .where(StaffProfile.deleted_at.is_(None))
    )

    total_result = await db.execute(
        select(func.count(StaffProfile.id)).where(
            StaffProfile.store_id == store_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    total = total_result.scalar() or 0

    stmt = base_stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = [StaffProfileOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post("", response_model=APIResponse[StaffProfileOut], status_code=status.HTTP_201_CREATED)
async def create_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    data: StaffProfileCreate,
):
    """Create a new staff profile with an IAMPrincipal."""
    principal = IAMPrincipal(
        principal_type="human",
        status="active",
    )
    db.add(principal)
    await db.flush()
    await db.refresh(principal)

    profile_data = data.model_dump()
    profile_data["principal_id"] = principal.id

    profile = StaffProfile(**profile_data)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return APIResponse(data=StaffProfileOut.model_validate(profile))


@router.get("/{staff_id}", response_model=APIResponse[StaffProfileDetailOut])
async def get_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
):
    """Get a single staff profile with shifts."""
    result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    shifts_result = await db.execute(
        select(StaffShift).where(StaffShift.staff_id == staff_id)
    )
    shifts = shifts_result.scalars().all()

    profile_dict = {
        c: getattr(profile, c) for c in profile.__table__.columns.keys()
    }
    profile_dict["shifts"] = [StaffShiftOut.model_validate(s) for s in shifts]

    return APIResponse(data=StaffProfileDetailOut.model_validate(profile_dict))


@router.patch("/{staff_id}", response_model=APIResponse[StaffProfileOut])
async def update_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
    data: StaffProfileUpdate,
):
    """Update a staff profile."""
    result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return APIResponse(data=StaffProfileOut.model_validate(profile))


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
):
    """Soft-delete a staff profile."""
    result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    profile.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.get("/{staff_id}/shifts", response_model=APIResponse[PaginatedResponse[StaffShiftOut]])
async def list_staff_shifts(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List shifts for a staff member (paginated)."""
    # Verify staff exists and is not deleted
    profile_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    total_result = await db.execute(
        select(func.count(StaffShift.id)).where(StaffShift.staff_id == staff_id)
    )
    total = total_result.scalar() or 0

    stmt = (
        select(StaffShift)
        .where(StaffShift.staff_id == staff_id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [StaffShiftOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/{staff_id}/shifts",
    response_model=APIResponse[StaffShiftOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_staff_shift(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
    data: StaffShiftCreate,
):
    """Create a shift for a staff member."""
    profile_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    shift_data = data.model_dump()
    shift_data["staff_id"] = staff_id

    shift = StaffShift(**shift_data)
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return APIResponse(data=StaffShiftOut.model_validate(shift))


@router.patch("/{staff_id}/shifts/{shift_id}", response_model=APIResponse[StaffShiftOut])
async def update_staff_shift(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
    shift_id: int,
    data: StaffShiftUpdate,
):
    """Update a staff shift."""
    profile_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    result = await db.execute(
        select(StaffShift).where(
            StaffShift.id == shift_id,
            StaffShift.staff_id == staff_id,
        )
    )
    shift = result.scalar_one_or_none()
    if shift is None:
        raise HTTPException(status_code=404, detail="Shift not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shift, field, value)

    await db.commit()
    await db.refresh(shift)
    return APIResponse(data=StaffShiftOut.model_validate(shift))
