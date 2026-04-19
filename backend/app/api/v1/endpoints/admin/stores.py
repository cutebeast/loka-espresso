import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

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
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.is_active == True))
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


UNIVERSAL_MENU_STORE_ID = 0


@router.get("/{store_id}/menu")
async def get_store_menu(store_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Universal menu: always serve from HQ (store_id=0)
    # This ensures all stores show the same menu — like real Starbucks/ZUS
    cat_result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.store_id == UNIVERSAL_MENU_STORE_ID, MenuCategory.is_active == True)
        .order_by(MenuCategory.display_order)
    )
    categories = []
    for cat in cat_result.scalars().all():
        item_result = await db.execute(
            select(MenuItem)
            .where(
                MenuItem.store_id == UNIVERSAL_MENU_STORE_ID,
                MenuItem.category_id == cat.id,
                MenuItem.is_available == True,
            )
            .order_by(MenuItem.display_order)
        )
        items = item_result.scalars().all()
        categories.append({
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
    return {"store_id": store_id, "store_name": store.name, "categories": categories}


@router.get("/{store_id}/tables", response_model=list[StoreTableOut])
async def get_store_tables(store_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StoreTable).where(StoreTable.store_id == store_id)
    )
    return result.scalars().all()


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
