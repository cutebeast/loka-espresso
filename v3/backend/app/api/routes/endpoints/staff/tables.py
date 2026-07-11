"""Staff-scoped dining table endpoints."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.store import DiningTable, TableStatusSnapshot
from app.schemas.base import APIResponse
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
    table.qr_code_image_url = f"loka:table:{token}"
    table.qr_generated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(table)
    out = DiningTableOut.model_validate(table)
    out.current_status = await _enrich_table_status(db, table)
    return APIResponse(data=out)
