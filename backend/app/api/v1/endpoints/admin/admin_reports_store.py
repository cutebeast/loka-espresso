from datetime import timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_hq_access, require_store_access
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.order import Order, OrderStatus
from app.models.store import StoreTable
from app.models.marketing import TableOccupancySnapshot
from app.schemas.store import SetTableOccupancyRequest

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/reports/sales")
async def sales_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    total = sum(to_float(o.total) for o in orders)
    return {"items": [{"order_number": o.order_number, "total": to_float(o.total), "type": o.order_type, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders], "total": round(total, 2)}


@router.get("/reports/popular")
async def popular_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    item_counts = {}
    for o in orders:
        for item in (o.items or []):
            name = item.get("name", "Unknown")
            item_counts[name] = item_counts.get(name, 0) + item.get("quantity", 1)
    sorted_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    return {"items": [{"item_name": name, "order_count": count} for name, count in sorted_items]}


@router.get("/export")
async def export_data(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    type: str = Query("orders"), store_id: int = Query(None),
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    rows = []
    for o in orders:
        rows.append({
            "order_number": o.order_number, "order_type": o.order_type,
            "total": to_float(o.total), "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else "",
        })
    return {"items": rows, "count": len(rows)}


@router.patch("/stores/{store_id}/tables/{table_id}/occupancy")
async def set_table_occupancy(
    store_id: int, table_id: int, req: SetTableOccupancyRequest,
    user: AdminUser = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Manually set table occupancy (override trigger-based status).
    Body: {"is_occupied": true/false}
    """
    is_occupied = req.is_occupied
    if is_occupied is None:
        raise HTTPException(status_code=400, detail="is_occupied is required")

    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.is_occupied = is_occupied

    snap_result = await db.execute(
        select(TableOccupancySnapshot).where(TableOccupancySnapshot.table_id == table_id)
    )
    snap = snap_result.scalar_one_or_none()
    if snap:
        snap.is_occupied = is_occupied
        if not is_occupied:
            snap.current_order_id = None
        snap.updated_at = datetime.now(timezone.utc)
    else:
        snap = TableOccupancySnapshot(
            table_id=table_id, store_id=store_id, is_occupied=is_occupied,
        )
        db.add(snap)

    return {"table_id": table_id, "is_occupied": is_occupied}
