"""Admin staff management endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.core.security import hash_password
from app.models.iam import IAMPrincipal, IAMRole, RoleAssignment
from app.models.platform import AuditLog
from app.models.staff import StaffProfile, StaffShift, StaffTask, ShiftTemplate
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.staff import (
    StaffCreateRequest,
    ShiftFlatCreate,
    ShiftTemplateCreate,
    StaffRolesUpdateRequest,
    StaffProfileCreate,
    StaffProfileDetailOut,
    StaffProfileOut,
    StaffProfileUpdate,
    StaffShiftCreate,
    StaffShiftOut,
    StaffShiftUpdate,
    StaffTaskCreate,
    StaffTaskOut,
    StaffTaskUpdate,
)

router = APIRouter(prefix="/admin/staff", tags=["admin — staff"])


@router.get("", response_model=APIResponse[PaginatedResponse[StaffProfileOut]])
async def list_staff(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List staff profiles, optionally filtered by store (paginated)."""
    base_stmt = select(StaffProfile).where(StaffProfile.deleted_at.is_(None))
    if store_id is not None:
        base_stmt = base_stmt.where(StaffProfile.store_id == store_id)

    total_stmt = select(func.count(StaffProfile.id)).where(StaffProfile.deleted_at.is_(None))
    if store_id is not None:
        total_stmt = total_stmt.where(StaffProfile.store_id == store_id)
    total_result = await db.execute(total_stmt)
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
    data: StaffCreateRequest,
):
    """Create a new staff profile with credentials."""
    email = (data.email or "").strip()
    password = (data.password or "").strip()
    pin = (data.pin or "000000").strip()
    display_name = data.display_name.strip()

    if not display_name:
        raise HTTPException(status_code=400, detail="Display name required")

    principal = IAMPrincipal(principal_type="human", status="active")
    db.add(principal)
    await db.flush()

    pw_hash = hash_password(password) if password else None
    pin_hash = hash_password(pin)

    # Generate employee_id from principal_id
    employee_id = f"EMP{principal.id:04d}"

    profile = StaffProfile(
        principal_id=principal.id,
        store_id=data.store_id,
        employee_id=employee_id,
        display_name=display_name,
        email_address=email or None,
        password_hash=pw_hash,
        pin_hash=pin_hash,
        phone_number=data.phone_number,
        role=data.role,
        is_active=True,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    profile_id = profile.id
    profile_name = profile.display_name

    # Audit log
    db.add(AuditLog(
        principal_id=admin.id,
        action="create",
        resource_type="staff",
        resource_id=profile_id,
        changes_summary={"display_name": display_name, "email": email, "store_id": data.store_id},
    ))
    await db.commit()

    return APIResponse(data={
        "id": profile_id,
        "display_name": profile_name,
        "email": email,
        "message": "Staff created successfully",
    })



@router.get("/roles", response_model=APIResponse[PaginatedResponse[dict]])
async def list_staff_roles(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List all staff profiles with their IAM role assignments."""
    from app.models.iam import RoleAssignment
    from sqlalchemy.orm import joinedload

    total_result = await db.execute(
        select(func.count(StaffProfile.id)).where(StaffProfile.deleted_at.is_(None))
    )
    total = total_result.scalar() or 0

    result = await db.execute(
        select(StaffProfile)
        .options(joinedload(StaffProfile.store))
        .where(StaffProfile.deleted_at.is_(None))
        .order_by(StaffProfile.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    staff_list = result.unique().scalars().all()

    # staff_profiles.role is the canonical staff role; RoleAssignment is for admin accounts only.
    items = []
    for sp in staff_list:
        items.append({
            "id": sp.id, "principal_id": sp.principal_id,
            "display_name": sp.display_name,
            "email_address": sp.email_address,
            "employee_id": sp.employee_id,
            "store_id": sp.store_id,
            "store_name": sp.store.store_name if sp.store else None,
            "has_pin": bool(sp.pin_hash),
            "is_active": sp.is_active,
            "role": sp.role,
        })
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


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
    base_stmt = select(StaffShift).options(
        selectinload(StaffShift.store),
        selectinload(StaffShift.staff),
        selectinload(StaffShift.template),
    )
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
    for s in result.unique().scalars().all():
        staff_name = s.staff.display_name if s.staff else "Unknown"
        template_name = "—"
        start_time = None
        end_time = None
        if s.template:
            template_name = s.template.name
            start_time = str(s.template.start_time)
            end_time = str(s.template.end_time)
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
async def create_shift_flat(db: DBDependency, admin: CurrentAdmin, data: ShiftFlatCreate):
    """Create a shift (staff_id in body, for admin frontend)."""
    sid = data.staff_id
    if not sid:
        raise HTTPException(status_code=400, detail="staff_id required")
    profile_result = await db.execute(select(StaffProfile).where(StaffProfile.id == sid, StaffProfile.deleted_at.is_(None)))
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    planned_start = data.planned_start
    planned_end = data.planned_end
    if data.shift_template_id is not None and (planned_start is None or planned_end is None):
        template = await db.get(ShiftTemplate, data.shift_template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Shift template not found")
        planned_start = datetime.combine(data.shift_date, template.start_time, tzinfo=timezone.utc)
        planned_end = datetime.combine(data.shift_date, template.end_time, tzinfo=timezone.utc)
        if planned_end <= planned_start:
            planned_end += timedelta(days=1)

    if planned_start is None or planned_end is None:
        raise HTTPException(status_code=400, detail="planned_start and planned_end are required when no shift_template_id is provided")

    shift = StaffShift(
        store_id=data.store_id, staff_id=sid,
        shift_template_id=data.shift_template_id,
        shift_date=data.shift_date,
        planned_start=planned_start,
        planned_end=planned_end,
        status=data.status, notes=data.notes,
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
    per_page: int = Query(20, ge=1, le=500),
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

@router.get("/shift-templates", response_model=APIResponse[PaginatedResponse[dict]])
async def list_shift_templates(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    from app.models.staff import ShiftTemplate
    total_result = await db.execute(
        select(func.count(ShiftTemplate.id)).where(ShiftTemplate.store_id == store_id)
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(ShiftTemplate)
        .where(ShiftTemplate.store_id == store_id)
        .order_by(ShiftTemplate.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = [{"id": t.id, "store_id": t.store_id, "name": t.name, "start_time": str(t.start_time), "end_time": str(t.end_time)} for t in result.scalars().all()]
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )

@router.post("/shift-templates", response_model=APIResponse[dict], status_code=201)
async def create_shift_template(db: DBDependency, admin: CurrentAdmin, data: ShiftTemplateCreate):
    from app.models.staff import ShiftTemplate
    t = ShiftTemplate(store_id=data.store_id, name=data.name, start_time=data.start_time, end_time=data.end_time)
    db.add(t); await db.commit(); await db.refresh(t)
    return APIResponse(data={"id": t.id, "name": t.name})


# ── Staff Role Management ── 

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


# ── Staff Tasks (admin management) ──

@router.get("/tasks", response_model=APIResponse[PaginatedResponse[StaffTaskOut]])
async def list_staff_tasks(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int | None = Query(None),
    store_id: int | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List staff tasks with optional filters."""
    base_stmt = select(StaffTask)
    count_stmt = select(func.count(StaffTask.id))
    if staff_id is not None:
        base_stmt = base_stmt.where(StaffTask.staff_id == staff_id)
        count_stmt = count_stmt.where(StaffTask.staff_id == staff_id)
    if store_id is not None:
        base_stmt = base_stmt.where(StaffTask.store_id == store_id)
        count_stmt = count_stmt.where(StaffTask.store_id == store_id)
    if status is not None:
        base_stmt = base_stmt.where(StaffTask.status == status)
        count_stmt = count_stmt.where(StaffTask.status == status)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = (
        base_stmt.order_by(StaffTask.due_date.asc().nulls_last(), StaffTask.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [StaffTaskOut.model_validate(r) for r in result.scalars().all()]
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post("/tasks", response_model=APIResponse[StaffTaskOut], status_code=status.HTTP_201_CREATED)
async def create_staff_task(
    db: DBDependency,
    admin: CurrentAdmin,
    data: StaffTaskCreate,
):
    """Create a task assigned to a staff member."""
    profile_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == data.staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    if profile_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Staff not found")

    task = StaffTask(**data.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return APIResponse(data=StaffTaskOut.model_validate(task))


@router.patch("/tasks/{task_id}", response_model=APIResponse[StaffTaskOut])
async def update_staff_task(
    db: DBDependency,
    admin: CurrentAdmin,
    task_id: int,
    data: StaffTaskUpdate,
):
    """Update a staff task."""
    result = await db.execute(select(StaffTask).where(StaffTask.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return APIResponse(data=StaffTaskOut.model_validate(task))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_task(
    db: DBDependency,
    admin: CurrentAdmin,
    task_id: int,
):
    """Delete a staff task."""
    result = await db.execute(select(StaffTask).where(StaffTask.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    return APIResponse(data={"id": task_id, "deleted": True})


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




@router.patch("/{staff_id}/role", response_model=APIResponse[dict])
async def update_staff_role(
    db: DBDependency,
    admin: CurrentAdmin,
    staff_id: int,
    data: StaffProfileUpdate,
):
    """Update the canonical role of a staff member.

    Staff roles are stored directly on staff_profiles.role. RoleAssignment is
    reserved for admin accounts.
    """
    if data.role is None:
        raise HTTPException(status_code=400, detail="role is required")
    result = await db.execute(
        select(StaffProfile).where(StaffProfile.id == staff_id, StaffProfile.deleted_at.is_(None))
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=404, detail="Staff not found")

    sp.role = data.role
    sp.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"staff_id": staff_id, "role": sp.role, "updated": True})
