"""Staff shift and task endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.staff import StaffProfile, StaffShift, StaffTask
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.staff import StaffShiftOut, StaffTaskOut

router = APIRouter(tags=["staff — shifts"])


# ── Staff Shifts ──

@router.get("/staff/shifts/me", response_model=APIResponse[PaginatedResponse[StaffShiftOut]])
async def list_my_shifts(
    db: DBDependency,
    staff: CurrentStaff,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List shifts for the currently logged-in staff member."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    base_stmt = select(StaffShift).where(StaffShift.staff_id == staff_id)
    count_stmt = select(func.count(StaffShift.id)).where(StaffShift.staff_id == staff_id)
    if from_date is not None:
        base_stmt = base_stmt.where(StaffShift.shift_date >= from_date)
        count_stmt = count_stmt.where(StaffShift.shift_date >= from_date)
    if to_date is not None:
        base_stmt = base_stmt.where(StaffShift.shift_date <= to_date)
        count_stmt = count_stmt.where(StaffShift.shift_date <= to_date)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = (
        base_stmt.order_by(StaffShift.shift_date.desc(), StaffShift.planned_start.asc())
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


# ── Staff Tasks ──

@router.get("/staff/tasks/me", response_model=APIResponse[PaginatedResponse[StaffTaskOut]])
async def list_my_tasks(
    db: DBDependency,
    staff: CurrentStaff,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List tasks assigned to the currently logged-in staff member."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    base_stmt = select(StaffTask).where(StaffTask.staff_id == staff_id)
    count_stmt = select(func.count(StaffTask.id)).where(StaffTask.staff_id == staff_id)
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


@router.post("/staff/tasks/{task_id}/complete", response_model=APIResponse[StaffTaskOut])
async def complete_my_task(
    db: DBDependency,
    staff: CurrentStaff,
    task_id: int,
):
    """Mark a task assigned to the current staff member as completed."""
    staff_id = staff.id if isinstance(staff, StaffProfile) else int(getattr(staff, "id", 0))
    result = await db.execute(
        select(StaffTask).where(StaffTask.id == task_id, StaffTask.staff_id == staff_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status == "completed":
        raise HTTPException(status_code=400, detail="Task already completed")
    task.status = "completed"
    task.completed_at = datetime.now(timezone.utc)
    task.completed_by = staff_id

    # Recurring task → auto-create the next occurrence
    if task.recur_interval_days:
        from datetime import timedelta
        base_due = task.due_date or task.completed_at.date()
        next_task = StaffTask(
            store_id=task.store_id,
            staff_id=task.staff_id,
            title=task.title,
            description=task.description,
            status="pending",
            priority=task.priority,
            due_date=base_due + timedelta(days=task.recur_interval_days),
            recur_interval_days=task.recur_interval_days,
        )
        db.add(next_task)

    await db.commit()
    await db.refresh(task)
    return APIResponse(data=StaffTaskOut.model_validate(task))
