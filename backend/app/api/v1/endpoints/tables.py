from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user, can_access_store
from app.models.store import Store, StoreTable
from app.models.marketing import TableOccupancySnapshot
from app.models.user import User
from app.schemas.store import TableScanRequest

router = APIRouter(prefix="/tables", tags=["Tables"])


@router.post("/scan")
async def scan_qr(req: TableScanRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.slug == req.store_slug, Store.is_active == True))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    table_result = await db.execute(
        select(StoreTable).where(StoreTable.store_id == store.id, StoreTable.id == req.table_id, StoreTable.is_active == True)
    )
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return {
        "store_id": store.id,
        "store_name": store.name,
        "store_slug": store.slug,
        "table_id": table.id,
        "table_number": table.table_number,
        "capacity": table.capacity,
    }


@router.get("/{table_id}")
async def get_table(table_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    store_result = await db.execute(select(Store).where(Store.id == table.store_id))
    store = store_result.scalar_one_or_none()
    return {
        "id": table.id,
        "store_id": table.store_id,
        "store_name": store.name if store else None,
        "table_number": table.table_number,
        "capacity": table.capacity,
        "qr_code_url": table.qr_code_url,
    }


@router.post("/{table_id}/release")
async def release_table(
    table_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Release a table after dine-in order is completed.
    Only accessible by store staff/admin or the customer who occupied it.
    """
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # Check access - user must have access to the store
    has_access = await can_access_store(user, table.store_id, db)
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this table")

    # Check if table is occupied
    if not table.is_occupied:
        return {
            "message": "Table is already available",
            "table_id": table.id,
            "table_number": table.table_number,
            "is_occupied": False,
        }

    # Release the table
    table.is_occupied = False
    await db.flush()

    # Update occupancy snapshot
    snap_result = await db.execute(
        select(TableOccupancySnapshot).where(TableOccupancySnapshot.table_id == table_id)
    )
    snapshot = snap_result.scalar_one_or_none()
    if snapshot:
        snapshot.is_occupied = False
        snapshot.current_order_id = None
        snapshot.updated_at = datetime.now(timezone.utc)
    else:
        snapshot = TableOccupancySnapshot(
            table_id=table_id,
            store_id=table.store_id,
            is_occupied=False,
            current_order_id=None,
        )
        db.add(snapshot)
    await db.flush()

    return {
        "message": "Table released successfully",
        "table_id": table.id,
        "table_number": table.table_number,
        "is_occupied": False,
        "released_at": datetime.now(timezone.utc).isoformat(),
    }
