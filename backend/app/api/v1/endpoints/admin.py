from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.order import Order, OrderStatus, OrderType
from app.models.menu import MenuCategory, MenuItem
from app.models.store import Store, StoreTable
from app.schemas.store import StoreCreate, TableCreate
from app.schemas.menu import CategoryCreate, MenuItemCreate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/dashboard")
async def dashboard(
    store_id: int = Query(None),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()

    total_orders = len(orders)
    total_revenue = sum(float(o.total) for o in orders if o.status != OrderStatus.cancelled)
    customers = set(o.user_id for o in orders)

    today = datetime.now().date()
    today_orders = [o for o in orders if o.created_at and o.created_at.date() == today]
    today_revenue = sum(float(o.total) for o in today_orders if o.status != OrderStatus.cancelled)

    orders_by_type = {}
    for o in orders:
        ot = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        orders_by_type[ot] = orders_by_type.get(ot, 0) + 1

    return {
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "total_customers": len(customers),
        "orders_today": len(today_orders),
        "revenue_today": round(today_revenue, 2),
        "orders_by_type": orders_by_type,
    }


@router.post("/stores", status_code=201)
async def create_store(req: StoreCreate, user: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    store = Store(**req.model_dump())
    db.add(store)
    await db.flush()
    return {"id": store.id, "name": store.name, "slug": store.slug}


@router.post("/stores/{store_id}/categories", status_code=201)
async def create_category(store_id: int, req: CategoryCreate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    slug = req.slug or req.name.lower().replace(" ", "-")
    cat = MenuCategory(store_id=store_id, name=req.name, slug=slug, display_order=req.display_order)
    db.add(cat)
    await db.flush()
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


@router.put("/stores/{store_id}/categories/{cat_id}")
async def update_category(store_id: int, cat_id: int, req: CategoryCreate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.store_id == store_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.name = req.name
    if req.slug:
        cat.slug = req.slug
    cat.display_order = req.display_order
    await db.flush()
    return {"id": cat.id, "name": cat.name}


@router.post("/stores/{store_id}/items", status_code=201)
async def create_item(store_id: int, req: MenuItemCreate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    item = MenuItem(store_id=store_id, **req.model_dump())
    db.add(item)
    await db.flush()
    return {"id": item.id, "name": item.name, "base_price": float(item.base_price)}


@router.put("/stores/{store_id}/items/{item_id}")
async def update_item(store_id: int, item_id: int, req: dict, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in req.items():
        if hasattr(item, k):
            setattr(item, k, v)
    await db.flush()
    return {"message": "Item updated"}


@router.delete("/stores/{store_id}/items/{item_id}")
async def delete_item(store_id: int, item_id: int, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.flush()
    return {"message": "Item deleted"}


@router.post("/stores/{store_id}/tables", status_code=201)
async def create_table(store_id: int, req: TableCreate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    table = StoreTable(store_id=store_id, table_number=req.table_number, capacity=req.capacity)
    db.add(table)
    await db.flush()
    qr_url = f"https://app.loyaltysystem.uk?store={{store_slug}}&table={table.id}"
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    slug = store.slug if store else store_id
    table.qr_code_url = f"https://app.loyaltysystem.uk?store={slug}&table={table.id}"
    await db.flush()
    return {"id": table.id, "table_number": table.table_number, "qr_code_url": table.qr_code_url}


@router.get("/reports/sales")
async def sales_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_role("admin", "store_owner")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    total = sum(float(o.total) for o in orders)
    return {"data": [{"order_number": o.order_number, "total": float(o.total), "type": o.order_type, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders], "total": round(total, 2)}


@router.get("/reports/popular")
async def popular_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_role("admin", "store_owner")),
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
    return {"data": [{"item_name": name, "order_count": count} for name, count in sorted_items]}


@router.get("/export")
async def export_data(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    type: str = Query("orders"), store_id: int = Query(None),
    user: User = Depends(require_role("admin", "store_owner")),
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
            "total": float(o.total), "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else "",
        })
    return {"data": rows, "count": len(rows)}
