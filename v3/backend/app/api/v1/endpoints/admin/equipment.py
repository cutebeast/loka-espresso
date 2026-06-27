"""Admin equipment and maintenance tracking endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.equipment import Equipment, EquipmentMaintenanceLog
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.equipment import (
    EquipmentCreate,
    EquipmentMaintenanceLogCreate,
    EquipmentMaintenanceLogOut,
    EquipmentMaintenanceLogUpdate,
    EquipmentOut,
    EquipmentUpdate,
)

router = APIRouter(prefix="/admin/equipment", tags=["admin — equipment"])


# ---------------------------------------------------------------------------
# Equipment
# ---------------------------------------------------------------------------

@router.get("", response_model=APIResponse[PaginatedResponse[EquipmentOut]])
async def list_equipment(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List equipment with optional filters."""
    stmt = select(Equipment).options(selectinload(Equipment.maintenance_logs)).where(Equipment.is_active.is_(True))
    count_stmt = select(Equipment.id).where(Equipment.is_active.is_(True))

    if store_id is not None:
        stmt = stmt.where(Equipment.store_id == store_id)
        count_stmt = count_stmt.where(Equipment.store_id == store_id)
    if status is not None:
        stmt = stmt.where(Equipment.status == status)
        count_stmt = count_stmt.where(Equipment.status == status)
    if search:
        stmt = stmt.where(Equipment.name.ilike(f"%{search}%"))
        count_stmt = count_stmt.where(Equipment.name.ilike(f"%{search}%"))

    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())

    stmt = stmt.order_by(Equipment.name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return APIResponse(
        data=PaginatedResponse(
            items=[EquipmentOut.model_validate(i) for i in items],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


# ---------------------------------------------------------------------------
# Reports Ledger (admin view of all reports across stores — must be before /{equipment_id})
# ---------------------------------------------------------------------------

@router.get("/reports", response_model=APIResponse[dict])
async def list_equipment_reports(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    equipment_id: int | None = Query(None),
    maintenance_type: str | None = Query(None),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
):
    """Ledger view of all equipment maintenance logs / staff reports."""
    base_stmt = select(EquipmentMaintenanceLog).join(
        Equipment, EquipmentMaintenanceLog.equipment_id == Equipment.id
    ).options(selectinload(EquipmentMaintenanceLog.equipment))
    count_stmt = select(func.count(EquipmentMaintenanceLog.id)).join(
        Equipment, EquipmentMaintenanceLog.equipment_id == Equipment.id
    )

    if store_id:
        base_stmt = base_stmt.where(Equipment.store_id == store_id)
        count_stmt = count_stmt.where(Equipment.store_id == store_id)
    if equipment_id:
        base_stmt = base_stmt.where(EquipmentMaintenanceLog.equipment_id == equipment_id)
        count_stmt = count_stmt.where(EquipmentMaintenanceLog.equipment_id == equipment_id)
    if maintenance_type:
        base_stmt = base_stmt.where(EquipmentMaintenanceLog.maintenance_type == maintenance_type)
        count_stmt = count_stmt.where(EquipmentMaintenanceLog.maintenance_type == maintenance_type)
    if status:
        base_stmt = base_stmt.where(EquipmentMaintenanceLog.status == status)
        count_stmt = count_stmt.where(EquipmentMaintenanceLog.status == status)
    if date_from:
        base_stmt = base_stmt.where(EquipmentMaintenanceLog.created_at >= date_from)
        count_stmt = count_stmt.where(EquipmentMaintenanceLog.created_at >= date_from)
    if date_to:
        base_stmt = base_stmt.where(EquipmentMaintenanceLog.created_at <= date_to)
        count_stmt = count_stmt.where(EquipmentMaintenanceLog.created_at <= date_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt
        .order_by(EquipmentMaintenanceLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    items = []
    for log in logs:
        items.append({
            "id": log.id,
            "equipment_id": log.equipment_id,
            "equipment_name": log.equipment.name,
            "equipment_type": log.equipment.equipment_type,
            "store_id": log.equipment.store_id,
            "maintenance_type": log.maintenance_type,
            "status": log.status,
            "description": log.description,
            "performed_by": log.performed_by,
            "image_urls": log.image_urls or [],
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return APIResponse(data={
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    })


@router.get("/{equipment_id}", response_model=APIResponse[EquipmentOut])
async def get_equipment(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
):
    """Get equipment by ID with maintenance logs."""
    result = await db.execute(
        select(Equipment).options(selectinload(Equipment.maintenance_logs)).where(Equipment.id == equipment_id, Equipment.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    # Load maintenance logs
    log_result = await db.execute(
        select(EquipmentMaintenanceLog).where(
            EquipmentMaintenanceLog.equipment_id == equipment_id
        ).order_by(EquipmentMaintenanceLog.created_at.desc())
    )
    logs = [EquipmentMaintenanceLogOut.model_validate(l) for l in log_result.scalars().all()]

    out = EquipmentOut.model_validate(item)
    out.maintenance_logs = logs
    return APIResponse(data=out)


@router.post("", response_model=APIResponse[EquipmentOut], status_code=status.HTTP_201_CREATED)
async def create_equipment(
    db: DBDependency,
    admin: CurrentAdmin,
    data: EquipmentCreate,
):
    """Create new equipment record."""
    item = Equipment(**data.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    result = await db.execute(
        select(Equipment).options(selectinload(Equipment.maintenance_logs)).where(Equipment.id == item.id)
    )
    item = result.scalar_one()
    return APIResponse(data=EquipmentOut.model_validate(item))


@router.patch("/{equipment_id}", response_model=APIResponse[EquipmentOut])
async def update_equipment(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
    data: EquipmentUpdate,
):
    """Update equipment record."""
    result = await db.execute(
        select(Equipment)
        .options(selectinload(Equipment.maintenance_logs))
        .where(Equipment.id == equipment_id, Equipment.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return APIResponse(data=EquipmentOut.model_validate(item))


@router.delete("/{equipment_id}", response_model=APIResponse[dict])
async def delete_equipment(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
):
    """Soft-delete equipment."""
    result = await db.execute(
        select(Equipment).where(Equipment.id == equipment_id, Equipment.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    item.is_active = False
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": item.id, "deleted": True})


# ---------------------------------------------------------------------------
# Maintenance Logs
# ---------------------------------------------------------------------------

@router.get("/{equipment_id}/maintenance-logs", response_model=APIResponse[list[EquipmentMaintenanceLogOut]])
async def list_maintenance_logs(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
):
    """List maintenance logs for equipment."""
    result = await db.execute(
        select(Equipment).where(Equipment.id == equipment_id, Equipment.is_active.is_(True))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    log_result = await db.execute(
        select(EquipmentMaintenanceLog).where(
            EquipmentMaintenanceLog.equipment_id == equipment_id
        ).order_by(EquipmentMaintenanceLog.created_at.desc())
    )
    logs = [EquipmentMaintenanceLogOut.model_validate(l) for l in log_result.scalars().all()]
    return APIResponse(data=logs)


@router.post("/{equipment_id}/maintenance-logs", response_model=APIResponse[EquipmentMaintenanceLogOut], status_code=status.HTTP_201_CREATED)
async def create_maintenance_log(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
    data: EquipmentMaintenanceLogCreate,
):
    """Create a maintenance log for equipment."""
    result = await db.execute(
        select(Equipment).where(Equipment.id == equipment_id, Equipment.is_active.is_(True))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    log = EquipmentMaintenanceLog(
        equipment_id=equipment_id,
        **data.model_dump(exclude={"equipment_id"}),
    )
    db.add(log)

    # Update equipment last/next maintenance dates if completed
    if log.status == "completed" and log.completed_at:
        equip = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
        equipment = equip.scalar_one()
        equipment.last_maintenance_date = log.completed_at.date()

    await db.commit()
    await db.refresh(log)
    return APIResponse(data=EquipmentMaintenanceLogOut.model_validate(log))


@router.patch("/{equipment_id}/maintenance-logs/{log_id}", response_model=APIResponse[EquipmentMaintenanceLogOut])
async def update_maintenance_log(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
    log_id: int,
    data: EquipmentMaintenanceLogUpdate,
):
    """Update a maintenance log."""
    result = await db.execute(
        select(EquipmentMaintenanceLog).where(
            EquipmentMaintenanceLog.id == log_id,
            EquipmentMaintenanceLog.equipment_id == equipment_id,
        )
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Maintenance log not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    # Update equipment last maintenance if completed
    if log.status == "completed" and log.completed_at:
        equip = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
        equipment = equip.scalar_one()
        equipment.last_maintenance_date = log.completed_at.date()

    log.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(log)
    return APIResponse(data=EquipmentMaintenanceLogOut.model_validate(log))


@router.delete("/{equipment_id}/maintenance-logs/{log_id}", response_model=APIResponse[dict])
async def delete_maintenance_log(
    db: DBDependency,
    admin: CurrentAdmin,
    equipment_id: int,
    log_id: int,
):
    """Delete a maintenance log."""
    result = await db.execute(
        select(EquipmentMaintenanceLog).where(
            EquipmentMaintenanceLog.id == log_id,
            EquipmentMaintenanceLog.equipment_id == equipment_id,
        )
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Maintenance log not found")

    await db.delete(log)
    await db.commit()
    return APIResponse(data={"id": log_id, "deleted": True})
