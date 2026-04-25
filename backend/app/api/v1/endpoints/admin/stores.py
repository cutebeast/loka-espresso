import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, asc, case

from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_store_access, now_utc
from app.core.utils import to_float
from app.models.user import User
from app.models.store import Store, StoreTable
from app.models.menu import MenuCategory, MenuItem
from app.schemas.store import (
    StoreOut, StoreCreate, StoreUpdate, StoreTableOut, TableCreate,
    TableScanRequest, PickupSlotOut,
)

router = APIRouter(prefix="/stores", tags=["Stores"])


@router.get("", response_model=list[StoreOut])
async def list_stores(
    lat: float | None = None,
    lng: float | None = None,
    radius: float = 50,
    include_hq: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """List active customer-facing stores.

    Store id=0 is reserved for HQ (universal-menu source) and is NEVER
    surfaced to customers. Admin tools can opt-in via include_hq=true.
    """
    q = select(Store).where(Store.is_active == True)
    if not include_hq:
        q = q.where(Store.id != 0)
    result = await db.execute(q)
    stores = result.scalars().all()
    out = []
    for s in stores:
        d = StoreOut.model_validate(s)
        if lat is not None and lng is not None and s.lat and s.lng:
            d.lat = to_float(s.lat)
            d.lng = to_float(s.lng)
        out.append(d)
    return out


@router.get("/{store_id}", response_model=StoreOut)
async def get_store(store_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.get("/{store_id}/menu")
async def get_store_menu(store_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Universal menu — same catalog for every store
    cat_result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.is_active == True)
        .order_by(MenuCategory.display_order)
    )
    categories = cat_result.scalars().all()

    cat_ids = [c.id for c in categories]
    if cat_ids:
        items_result = await db.execute(
            select(MenuItem)
            .where(
                MenuItem.category_id.in_(cat_ids),
                MenuItem.is_available == True,
            )
            .order_by(MenuItem.display_order)
        )
        all_items = items_result.scalars().all()
        items_by_cat = {}
        for item in all_items:
            items_by_cat.setdefault(item.category_id, []).append(item)
    else:
        items_by_cat = {}

    cats_out = []
    for cat in categories:
        items = items_by_cat.get(cat.id, [])
        cats_out.append({
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "display_order": cat.display_order,
            "items": [
                {
                    "id": i.id,
                    "name": i.name,
                    "description": i.description,
                    "base_price": to_float(i.base_price),
                    "image_url": i.image_url,
                    "customization_options": i.customization_options,
                    "is_available": i.is_available,
                    "display_order": i.display_order,
                }
                for i in items
            ],
        })
    return {"store_id": store_id, "store_name": store.name, "categories": cats_out}


@router.get("/{store_id}/tables")
async def get_store_tables(
    store_id: int,
    db: AsyncSession = Depends(get_db),
):
    """List tables sorted by is_active DESC, table_number ASC.
    Includes active_order info for dine-in orders that are not completed/cancelled."""
    from app.models.order import Order, OrderStatus

    result = await db.execute(
        select(StoreTable)
        .where(StoreTable.store_id == store_id)
        .order_by(
            case((StoreTable.is_active == True, 0), else_=1),
            StoreTable.table_number.asc(),
        )
    )
    tables = result.scalars().all()

    # Fetch active (non-terminal) orders for each table in this store
    active_orders_result = await db.execute(
        select(Order).where(
            Order.store_id == store_id,
            Order.table_id.isnot(None),
            Order.status.notin_([
                OrderStatus.completed,
                OrderStatus.cancelled,
            ]),
        )
    )
    active_orders = active_orders_result.scalars().all()

    # Build a map: table_id -> active order
    order_by_table: dict[int, dict] = {}
    for o in active_orders:
        if o.table_id:
            order_by_table[o.table_id] = {
                "id": o.id,
                "order_number": o.order_number,
                "status": o.status.value if hasattr(o.status, 'value') else str(o.status),
                "order_type": o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type),
                "total": to_float(o.total),
                "payment_status": o.payment_status,
            }

    return [
        {
            "id": t.id,
            "store_id": t.store_id,
            "table_number": t.table_number,
            "qr_code_url": t.qr_code_url,
            "qr_generated_at": t.qr_generated_at,
            "capacity": t.capacity,
            "is_active": t.is_active,
            "is_occupied": t.is_occupied,
            "active_order": order_by_table.get(t.id),
        }
        for t in tables
    ]


@router.get("/{store_id}/pickup-slots", response_model=list[PickupSlotOut])
async def get_pickup_slots(
    store_id: int,
    date: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    lead = store.pickup_lead_minutes or 15
    now = now_utc()
    target = now
    if date:
        try:
            parsed = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if parsed.date() > now.date():
                target = parsed.replace(hour=8, minute=0)
        except ValueError:
            pass
    start = target + timedelta(minutes=lead)
    start = start.replace(minute=(start.minute // 15) * 15, second=0, microsecond=0)
    slots = []
    for i in range(32):
        slot_time = start + timedelta(minutes=15 * i)
        if slot_time.hour >= 22:
            break
        slots.append(PickupSlotOut(time=slot_time.isoformat(), available=True))
    return slots


@router.put("/{store_id}", response_model=StoreOut)
async def update_store(
    store_id: int,
    req: StoreUpdate,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(store, k, v)
    await db.flush()
    return store
