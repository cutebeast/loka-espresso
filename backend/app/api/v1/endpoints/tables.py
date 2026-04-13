from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.store import Store, StoreTable
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
