"""Staff-scoped dining table endpoints."""

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.store import DiningTable, Store, TableStatusSnapshot
from app.schemas.base import APIResponse
from app.services.platform_config import PlatformConfigService
from app.schemas.store import DiningTableOut

router = APIRouter(prefix="/staff/tables", tags=["staff — tables"])


async def _enrich_table_status(db, table):
    """Look up current_status from table_status_snapshot."""
    result = await db.execute(
        select(TableStatusSnapshot.status).where(TableStatusSnapshot.table_id == table.id)
    )
    status = result.scalar_one_or_none()
    return status or "available"


@router.post("/{table_id}/generate-qr", response_model=APIResponse[DiningTableOut])
async def generate_staff_table_qr(
    staff: CurrentStaff,
    db: DBDependency,
    table_id: int,
):
    """Generate QR code URL for a dining table in staff's store."""
    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")

    token = table.qr_code_token or uuid4().hex
    table.qr_code_token = token
    # Customer-facing QR: a full https URL so the phone's native camera opens the
    # PWA directly. Staff POS scanners read the same QR and extract the table id.
    store_result = await db.execute(select(Store.slug).where(Store.id == staff.store_id, Store.deleted_at.is_(None)))
    store_slug = store_result.scalar_one_or_none() or "store"
    config_service = PlatformConfigService(db)
    pwa_base = await config_service.get("pwa.public_url", "https://app.loyaltysystem.uk")
    table.qr_code_image_url = f"{pwa_base}/?store={store_slug}&table={table.id}&t={token}"
    table.qr_generated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(table)
    out = DiningTableOut.model_validate(table)
    out.current_status = await _enrich_table_status(db, table)
    return APIResponse(data=out)


@router.get("")
async def staff_list_tables(staff: CurrentStaff, db: DBDependency):
    """List dining tables for the staff member's store."""
    result = await db.execute(
        select(DiningTable)
        .where(
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
        .order_by(DiningTable.section, DiningTable.table_number)
    )
    tables = result.scalars().all()
    # Enrich with current status from TableStatusSnapshot (one batched query)
    snap_result = await db.execute(
        select(TableStatusSnapshot).where(TableStatusSnapshot.table_id.in_([t.id for t in tables] or [0]))
    )
    snap_map = {s.table_id: s for s in snap_result.scalars().all()}
    out = []
    for t in tables:
        snap = snap_map.get(t.id)
        out.append({
            "id": t.id,
            "store_id": t.store_id,
            "section": t.section,
            "table_number": t.table_number,
            "display_name": t.display_name,
            "capacity": t.capacity,
            "current_status": (snap.status if snap else "available"),
            "occupied_since": (snap.updated_at.isoformat() if snap and snap.status == "occupied" else None),
            "current_order_id": (snap.current_order_id if snap and snap.status == "occupied" else None),
            "is_active": t.is_active,
        })
    return APIResponse(data=out)


@router.patch("/{table_id}/status")
async def staff_update_table_status(
    staff: CurrentStaff,
    db: DBDependency,
    table_id: int,
    current_status: Literal["available", "occupied", "reserved", "cleaning"] = Query(..., alias="current_status"),
):
    """Update a table's status (staff endpoint)."""
    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == staff.store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    # Update or create table status snapshot
    snap_result = await db.execute(
        select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == table_id)
    )
    snap = snap_result.scalar_one_or_none()
    if snap:
        snap.status = current_status
        snap.updated_at = datetime.now(timezone.utc)
    else:
        snap = TableStatusSnapshot(table_id=table_id, store_id=staff.store_id, status=current_status)
        db.add(snap)
    await db.commit()
    return APIResponse(data={"id": table.id, "current_status": current_status})
