from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.order import Order, OrderStatus
from app.models.loyalty import LoyaltyTransaction
from app.models.menu import InventoryItem

router = APIRouter(prefix="/admin/reports", tags=["Admin Reports"])


@router.get("/revenue")
async def revenue_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None), group_by: str = Query("day"),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    total = sum(float(o.total) for o in orders)
    by_type = {}
    by_store = {}
    by_day = {}
    for o in orders:
        ot = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        by_type[ot] = by_type.get(ot, 0) + float(o.total)
        by_store[o.store_id] = by_store.get(o.store_id, 0) + float(o.total)
        day = o.created_at.date().isoformat() if o.created_at else "unknown"
        by_day[day] = by_day.get(day, 0) + float(o.total)
    return {"total": round(total, 2), "by_type": by_type, "by_store": by_store, "by_day": by_day}


@router.get("/loyalty")
async def loyalty_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    q = select(LoyaltyTransaction).where(LoyaltyTransaction.created_at >= from_date, LoyaltyTransaction.created_at <= to_date)
    result = await db.execute(q)
    txns = result.scalars().all()
    issued = sum(t.points for t in txns if t.type == "earn")
    redeemed = sum(t.points for t in txns if t.type == "redeem")
    expired = sum(t.points for t in txns if t.type == "expire")
    return {"points_issued": issued, "points_redeemed": redeemed, "points_expired": expired, "transactions": len(txns)}


@router.get("/inventory")
async def inventory_report(
    store_id: int = Query(...),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.store_id == store_id))
    items = result.scalars().all()
    low_stock = [{"name": i.name, "current": float(i.current_stock), "reorder": float(i.reorder_level)} for i in items if i.current_stock <= i.reorder_level]
    return {"total_items": len(items), "low_stock": low_stock, "items": [{"name": i.name, "stock": float(i.current_stock), "unit": i.unit} for i in items]}
