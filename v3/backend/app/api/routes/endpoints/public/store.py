"""Public store endpoints (no auth required)."""

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.routes.deps import DBDependency, OptionalLocale
from app.services.translation import merge_translations, translate_single
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


def _is_store_open(store, operating_hours, special_hours) -> bool:
    """Check if a store is currently open based on its timezone, special hours, and operating hours."""
    tz = store.timezone or "UTC"
    try:
        import zoneinfo
        now_local = datetime.now(zoneinfo.ZoneInfo(tz))
    except Exception:
        # Fallback: treat as UTC
        now_local = datetime.now(timezone.utc)

    today = now_local.date()
    current_time = now_local.time()
    current_minutes = current_time.hour * 60 + current_time.minute

    # Check special hours first
    if special_hours:
        for sh in special_hours:
            if sh.special_date == today:
                if sh.is_closed:
                    return False
                open_m = sh.open_time.hour * 60 + sh.open_time.minute if sh.open_time else 0
                close_m = sh.close_time.hour * 60 + sh.close_time.minute if sh.close_time else 24 * 60
                if close_m <= open_m:
                    close_m += 24 * 60
                if current_minutes >= open_m and current_minutes < close_m:
                    return True
                return False

    # Check regular operating hours
    day_of_week = today.weekday()  # 0=Monday (but our DB uses 0=Sunday!)
    # Convert Python weekday (Mon=0) to DB day_of_week (Sun=0)
    db_dow = (day_of_week + 1) % 7

    for oh in operating_hours:
        if oh.day_of_week == db_dow:
            if oh.is_closed:
                return False
            if oh.is_24_hours:
                return True
            open_m = oh.open_time.hour * 60 + oh.open_time.minute if oh.open_time else 0
            close_m = oh.close_time.hour * 60 + oh.close_time.minute if oh.close_time else 24 * 60
            if close_m <= open_m:
                close_m += 24 * 60
            return current_minutes >= open_m and current_minutes < close_m

    return False


@router.get("", response_model=APIResponse[PaginatedResponse[StorePublicOut]])
async def list_stores(
    db: DBDependency,
    locale: OptionalLocale,
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, gt=0, le=500),
    city: str | None = Query(None, max_length=100),
    is_open: bool | None = Query(None),
    search: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
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

    result = await db.execute(stmt)
    all_stores = result.scalars().all()

    # Enrich with operating hours (needed for is_open filter)
    store_ids = [s.id for s in all_stores]
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

    # Apply is_open filter in Python (timezone-aware)
    filtered = []
    for store in all_stores:
        if is_open is not None:
            open_now = _is_store_open(
                store,
                hours_map.get(store.id, []),
                special_map.get(store.id, []),
            )
            if open_now != is_open:
                continue
        filtered.append(store)

    total = len(filtered)

    # Pagination after filtering
    paginated = filtered[(page - 1) * per_page : page * per_page]

    store_dicts = []
    for store in paginated:
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
        store_dicts.append(store_dict)

    # Apply translations
    await merge_translations(db, store_dicts, "stores", locale)

    items = [StorePublicOut.model_validate(d) for d in store_dicts]

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
async def get_store(db: DBDependency, locale: OptionalLocale, store_id: int):
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

    await translate_single(db, store_dict, "stores", locale)

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
