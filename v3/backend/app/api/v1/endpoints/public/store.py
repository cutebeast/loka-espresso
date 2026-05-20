"""Public store endpoints (no auth required)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.deps import DBDependency
from app.models.store import (
    DiningTable,
    Store,
    StoreOperatingHours,
    StoreSpecialHours,
    TableStatusSnapshot,
)
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.store import StoreListParams, StoreOperatingHoursOut, StorePublicOut, StoreSpecialHoursOut

router = APIRouter(prefix="/stores", tags=["public — stores"])


@router.get("", response_model=APIResponse[PaginatedResponse[StorePublicOut]])
async def list_stores(
    db: DBDependency,
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, gt=0, le=100),
    city: str | None = Query(None, max_length=100),
    is_open: bool | None = Query(None),
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List public stores with optional filters."""
    stmt = select(Store).where(Store.is_active.is_(True))
    
    if city:
        stmt = stmt.where(Store.city.ilike(f"%{city}%"))
    if search:
        stmt = stmt.where(
            Store.store_name.ilike(f"%{search}%")
            | Store.brand_name.ilike(f"%{search}%")
        )
    
    # Count total (apply same filters)
    count_stmt = select(Store.id).where(Store.is_active.is_(True))
    if city:
        count_stmt = count_stmt.where(Store.city.ilike(f"%{city}%"))
    if search:
        count_stmt = count_stmt.where(
            Store.store_name.ilike(f"%{search}%")
            | Store.brand_name.ilike(f"%{search}%")
        )
    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())
    
    # Pagination
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    stores = result.scalars().all()
    
    # Enrich with operating hours
    store_ids = [s.id for s in stores]
    hours_result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id.in_(store_ids))
    )
    hours_map = {}
    for h in hours_result.scalars().all():
        hours_map.setdefault(h.store_id, []).append(h)
    
    special_result = await db.execute(
        select(StoreSpecialHours).where(StoreSpecialHours.store_id.in_(store_ids))
    )
    special_map = {}
    for s in special_result.scalars().all():
        special_map.setdefault(s.store_id, []).append(s)
    
    items = []
    for store in stores:
        store_dict = {
            c: getattr(store, c)
            for c in store.__table__.columns.keys()
        }
        store_dict["operating_hours"] = [
            StoreOperatingHoursOut.model_validate(h) for h in hours_map.get(store.id, [])
        ]
        store_dict["special_hours"] = [
            StoreSpecialHoursOut.model_validate(h) for h in special_map.get(store.id, [])
        ]
        items.append(StorePublicOut.model_validate(store_dict))
    
    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/{store_id}", response_model=APIResponse[StorePublicOut])
async def get_store(db: DBDependency, store_id: int):
    """Get public store details by ID."""
    result = await db.execute(
        select(Store).where(Store.id == store_id, Store.is_active.is_(True))
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=404, detail="Store not found")
    
    hours_result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id == store_id)
    )
    special_result = await db.execute(
        select(StoreSpecialHours).where(StoreSpecialHours.store_id == store_id)
    )
    
    store_dict = {
        c: getattr(store, c)
        for c in store.__table__.columns.keys()
    }
    store_dict["operating_hours"] = [
        StoreOperatingHoursOut.model_validate(h) for h in hours_result.scalars().all()
    ]
    store_dict["special_hours"] = [
        StoreSpecialHoursOut.model_validate(h) for h in special_result.scalars().all()
    ]
    
    return APIResponse(data=StorePublicOut.model_validate(store_dict))


# ── Table Scan (Dine-in QR) ──

@router.post("/tables/scan", response_model=APIResponse[dict])
async def scan_table(
    db: DBDependency,
    data: dict,
):
    """Scan a table QR code and return store+table context."""
    store_slug = data.get("store_slug") or data.get("storeSlug")
    table_id = data.get("table_id") or data.get("tableId")
    qr_token = data.get("qr_token") or data.get("qrToken") or data.get("t")

    if not store_slug or not table_id:
        raise HTTPException(status_code=400, detail="store_slug and table_id required")

    # Find store by slug
    store_result = await db.execute(
        select(Store).where(Store.slug == store_slug, Store.is_active.is_(True))
    )
    store = store_result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Find table
    table_result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == store.id,
            DiningTable.is_active.is_(True),
            DiningTable.deleted_at.is_(None),
        )
    )
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # Validate QR token if provided
    if qr_token and table.qr_code_token != qr_token:
        raise HTTPException(status_code=403, detail="Invalid QR code")

    # Update table status snapshot
    snap_result = await db.execute(
        select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == table.id)
    )
    snap = snap_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if snap:
        snap.status = "occupied"
        snap.party_size = 1
        snap.updated_at = now
    else:
        snap = TableStatusSnapshot(
            table_id=table.id,
            store_id=store.id,
            status="occupied",
            party_size=1,
            updated_at=now,
        )
        db.add(snap)

    await db.commit()

    return APIResponse(data={
        "store_id": store.id,
        "store_name": store.store_name,
        "store_slug": store.slug,
        "table_id": table.id,
        "table_number": table.table_number,
        "display_name": table.display_name,
        "capacity": table.capacity,
        "section": table.section,
    })
