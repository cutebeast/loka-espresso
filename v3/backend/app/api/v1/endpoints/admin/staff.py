"""Admin staff management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.iam import IAMPrincipal, IAMRole, RoleAssignment
from app.models.staff import StaffProfile, StaffShift, ShiftTemplate
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
    store_id: int | None = Query(None),
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


@router.post("", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    data: dict,
):
    """Create a new staff profile with credentials."""
    import bcrypt

    email = (data.get("email") or "").strip()
    password = (data.get("password") or "").strip()
    pin = (data.get("pin") or "000000").strip()
    display_name = (data.get("display_name") or "").strip()

    if not display_name:
        raise HTTPException(status_code=400, detail="Display name required")

    principal = IAMPrincipal(principal_type="human", status="active")
    db.add(principal)
    await db.flush()

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode() if password else None
    pin_hash = bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

    profile = StaffProfile(
        principal_id=principal.id,
        store_id=data.get("store_id"),
        display_name=display_name,
        email_address=email or None,
        password_hash=pw_hash,
        pin_hash=pin_hash,
        phone_number=data.get("phone_number"),
        role=data.get("role", "server"),
        is_active=True,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return APIResponse(data={
        "id": profile.id,
        "display_name": profile.display_name,
        "email": email,
        "password": password,
        "pin": pin,
        "message": "Staff created — share credentials with user",
    })



@router.get("/roles", response_model=APIResponse[list[dict]])
async def list_staff_roles(db: DBDependency, admin: CurrentAdmin):
    """List all staff profiles with their IAM role assignments."""
    from app.models.iam import RoleAssignment
    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(StaffProfile)
        .options(joinedload(StaffProfile.store))
        .where(StaffProfile.deleted_at.is_(None))
        .order_by(StaffProfile.id)
    )
    items = []
    for sp in result.scalars().all():
        role_result = await db.execute(
            select(IAMRole.display_name, IAMRole.id)
            .join(RoleAssignment, RoleAssignment.role_id == IAMRole.id)
            .where(RoleAssignment.assignee_id == sp.principal_id)
        )
        roles = [{"id": r[1], "name": r[0]} for r in role_result.all()]
        items.append({
            "id": sp.id, "principal_id": sp.principal_id,
            "display_name": sp.display_name,
            "email_address": sp.email_address,
            "employee_id": sp.employee_id,
            "store_id": sp.store_id,
            "store_name": sp.store.store_name if sp.store else None,
            "has_pin": bool(sp.pin_hash),
            "is_active": sp.is_active,
            "roles": roles,
        })
    return APIResponse(data=items)


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

    profile.is_active = False
    profile.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": staff_id, "deleted": True})


# ── Flat Shift endpoints (must be before /{staff_id}/* routes) ──

@router.get("/shifts", response_model=APIResponse[PaginatedResponse[dict]])
async def list_all_shifts(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int = Query(..., description="Store ID"),
    staff_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(200, ge=1, le=500),
):
    """List shifts flat, filterable by store_id and optionally staff_id."""
    count_stmt = select(func.count(StaffShift.id))
    base_stmt = select(StaffShift)
    if store_id:
        count_stmt = count_stmt.where(StaffShift.store_id == store_id)
        base_stmt = base_stmt.where(StaffShift.store_id == store_id)
    if staff_id:
        count_stmt = count_stmt.where(StaffShift.staff_id == staff_id)
        base_stmt = base_stmt.where(StaffShift.staff_id == staff_id)
    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = base_stmt.order_by(StaffShift.shift_date.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = []
    for s in result.scalars().all():
        staff_result = await db.execute(select(StaffProfile.display_name).where(StaffProfile.id == s.staff_id))
        staff_name = staff_result.scalar_one_or_none() or "Unknown"
        template_name = "—"
        start_time = None
        end_time = None
        if s.shift_template_id:
            tpl_result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == s.shift_template_id))
            tpl = tpl_result.scalar_one_or_none()
            if tpl:
                template_name = tpl.name
                start_time = str(tpl.start_time)
                end_time = str(tpl.end_time)
        if not start_time and s.planned_start:
            start_time = s.planned_start.strftime("%H:%M")
        if not end_time and s.planned_end:
            end_time = s.planned_end.strftime("%H:%M")
        items.append({
            "id": s.id, "staff_id": s.staff_id, "staff_name": staff_name,
            "store_id": s.store_id, "shift_template_id": s.shift_template_id,
            "template_name": template_name, "start_time": start_time, "end_time": end_time,
            "shift_date": s.shift_date.isoformat() if s.shift_date else None,
            "planned_start": s.planned_start.isoformat() if s.planned_start else None,
            "planned_end": s.planned_end.isoformat() if s.planned_end else None,
            "actual_start": s.actual_start.isoformat() if s.actual_start else None,
            "actual_end": s.actual_end.isoformat() if s.actual_end else None,
            "status": s.status, "notes": s.notes,
        })
    return APIResponse(data=PaginatedResponse(items=items, total=total, page=page, per_page=per_page,
        total_pages=(total + per_page - 1) // per_page if per_page else 0))


@router.post("/shifts", response_model=APIResponse[dict], status_code=status.HTTP_201_CREATED)
async def create_shift_flat(db: DBDependency, admin: CurrentAdmin, data: dict):
    """Create a shift (staff_id in body, for admin frontend)."""
    sid = int(data.get("staff_id", 0))
    if not sid:
        raise HTTPException(status_code=400, detail="staff_id required")
    profile_result = await db.execute(select(StaffProfile).where(StaffProfile.id == sid, StaffProfile.deleted_at.is_(None)))
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")
    shift = StaffShift(
        store_id=int(data.get("store_id", 0)), staff_id=sid,
        shift_template_id=data.get("shift_template_id"),
        shift_date=data.get("shift_date"),
        planned_start=data.get("planned_start") or data.get("shift_date"),
        planned_end=data.get("planned_end") or data.get("shift_date"),
        status=data.get("status", "scheduled"), notes=data.get("notes"),
    )
    db.add(shift); await db.commit(); await db.refresh(shift)
    return APIResponse(data={"id": shift.id, "message": "Shift created"})


@router.delete("/shifts/{shift_id}", response_model=APIResponse[dict])
async def delete_shift_flat(db: DBDependency, admin: CurrentAdmin, shift_id: int):
    """Delete a shift."""
    result = await db.execute(select(StaffShift).where(StaffShift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.delete(shift); await db.commit()
    return APIResponse(data={"id": shift_id, "deleted": True})


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

@router.get("/shift-templates", response_model=APIResponse[list[dict]])
async def list_shift_templates(db: DBDependency, admin: CurrentAdmin, store_id: int = Query(...)):
    from app.models.staff import ShiftTemplate
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.store_id == store_id).order_by(ShiftTemplate.name))
    items = [{"id": t.id, "store_id": t.store_id, "name": t.name, "start_time": str(t.start_time), "end_time": str(t.end_time)} for t in result.scalars().all()]
    return APIResponse(data=items)

@router.post("/shift-templates", response_model=APIResponse[dict], status_code=201)
async def create_shift_template(db: DBDependency, admin: CurrentAdmin, data: dict):
    from app.models.staff import ShiftTemplate
    t = ShiftTemplate(store_id=data["store_id"], name=data["name"], start_time=data["start_time"], end_time=data["end_time"])
    db.add(t); await db.commit(); await db.refresh(t)
    return APIResponse(data={"id": t.id, "name": t.name})


# ── Staff Role Management ── 

@router.post("/{staff_id}/roles", response_model=APIResponse[dict])
async def update_staff_roles(db: DBDependency, admin: CurrentAdmin, staff_id: int, data: dict):
    """Replace role assignments for a staff member."""
    result = await db.execute(select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None)))
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Remove existing role assignments
    existing = await db.execute(
        select(RoleAssignment).where(RoleAssignment.assignee_id == sp.principal_id)
    )
    for ra in existing.scalars().all():
        ra.is_active = False

    # Add new
    for rid in data.get("role_ids", []):
        db.add(RoleAssignment(assignee_id=sp.principal_id, role_id=rid, effective_from=datetime.now(timezone.utc), is_active=True))
    await db.commit()
    return APIResponse(data={"staff_id": staff_id, "updated": True})
