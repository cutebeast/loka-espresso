"""Admin store management endpoints."""

from datetime import date, datetime, time, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.order import Order
from app.models.store import (
    DiningTable,
    Reservation,
    Store,
    StoreConfiguration,
    StoreOperatingHours,
    StoreSpecialHours,
    TableStatusSnapshot,
)
from app.schemas.base import APIResponse, PaginatedResponse
from app.services.translation import auto_translate_record, delete_translations
from app.schemas.store import (
    DiningTableOut,
    StoreConfigurationOut,
    StoreCreate,
    StoreOperatingHoursBase,
    StoreOperatingHoursOut,
    StoreSpecialHoursOut,
    StoreUpdate,
    StoreOut,
)

router = APIRouter(prefix="/admin/stores", tags=["admin — stores"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class _StoreConfigurationOut(StoreConfigurationOut):
    """Inline schema to match the DB model (JSONB dict)."""

    config_value: dict


class StoreDetailOut(StoreOut):
    """Store with nested relations for admin detail view."""

    operating_hours: list[StoreOperatingHoursOut] = []
    special_hours: list[StoreSpecialHoursOut] = []
    configuration: list[_StoreConfigurationOut] = []
    dining_tables: list[DiningTableOut] = []


class DiningTableCreate(BaseModel):
    table_number: str = Field(..., max_length=20)
    display_name: str | None = Field(None, max_length=50)
    capacity: int = Field(..., ge=1, le=50)
    qr_code_token: str | None = Field(None, max_length=64)


class DiningTableUpdate(BaseModel):
    table_number: str | None = Field(None, max_length=20)
    display_name: str | None = Field(None, max_length=50)
    capacity: int | None = Field(None, ge=1, le=50)
    qr_code_token: str | None = Field(None, max_length=64)
    current_status: str | None = Field(None, max_length=20)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_store_or_404(db, store_id: int) -> Store:
    result = await db.execute(
        select(Store).where(Store.id == store_id, Store.deleted_at.is_(None))
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    return store


# ---------------------------------------------------------------------------
# Store CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=APIResponse[PaginatedResponse[StoreOut]])
async def list_stores(
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    is_active: bool | None = Query(None),
):
    """List all stores (paginated, optional is_active filter)."""
    base_stmt = select(Store).where(Store.deleted_at.is_(None))
    count_stmt = select(func.count(Store.id)).where(Store.deleted_at.is_(None))

    if is_active is not None:
        base_stmt = base_stmt.where(Store.is_active.is_(is_active))
        count_stmt = count_stmt.where(Store.is_active.is_(is_active))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(Store.position.asc(), Store.id.asc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    stores = result.scalars().all()

    # Bulk-load operating hours for all stores in page
    store_ids = [s.id for s in stores]
    hours_result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id.in_(store_ids))
    )
    hours_map: dict[int, list] = {}
    for h in hours_result.scalars().all():
        hours_map.setdefault(h.store_id, []).append({
            "day_of_week": h.day_of_week,
            "open_time": h.open_time,
            "close_time": h.close_time,
            "is_closed": h.is_closed,
            "is_24_hours": h.is_24_hours,
            "last_order_time": h.last_order_time,
        })

    items = []
    for s in stores:
        store_dict = {c: getattr(s, c) for c in s.__table__.columns.keys()}
        store_dict["operating_hours"] = hours_map.get(s.id, [])
        items.append(StoreOut.model_validate(store_dict).model_dump())

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post("", response_model=APIResponse[StoreOut], status_code=status.HTTP_201_CREATED)
async def create_store(
    db: DBDependency,
    admin: CurrentAdmin,
    data: StoreCreate,
):
    """Create a new store with default operating hours and configuration."""
    store = Store(**data.model_dump())
    db.add(store)
    await db.flush()
    await db.refresh(store)

    # Default operating hours (Mon–Sun 09:00–22:00)
    for day in range(7):
        db.add(
            StoreOperatingHours(
                store_id=store.id,
                day_of_week=day,
                open_time=time(9, 0),
                close_time=time(22, 0),
                is_closed=False,
                is_24_hours=False,
            )
        )

    # Default configuration entries
    db.add(
        StoreConfiguration(
            store_id=store.id,
            config_key="tax_inclusive_pricing",
            config_value={"enabled": True},
            description="Whether menu prices include tax",
        )
    )
    db.add(
        StoreConfiguration(
            store_id=store.id,
            config_key="auto_accept_orders",
            config_value={"enabled": False},
            description="Automatically accept incoming orders",
        )
    )

    await db.commit()
    await auto_translate_record(db, "stores", store.id, {"store_name": store.store_name})
    out = StoreOut(
        id=store.id,
        store_code=store.store_code,
        store_name=store.store_name,
        slug=store.slug,
        brand_name=store.brand_name,
        address_line_1=store.address_line_1,
        address_line_2=store.address_line_2,
        city=store.city,
        state_province=store.state_province,
        postal_code=store.postal_code,
        country_code=store.country_code,
        latitude=store.latitude,
        longitude=store.longitude,
        phone_number=store.phone_number,
        email_address=store.email_address,
        timezone=store.timezone,
        currency_code=store.currency_code,
        logo_url=store.logo_url,
        banner_image_url=store.banner_image_url,
        pickup_lead_minutes=store.pickup_lead_minutes,
        delivery_radius_km=store.delivery_radius_km,
        first_order_minutes_after_open=store.first_order_minutes_after_open,
        last_order_minutes_before_close=store.last_order_minutes_before_close,
        is_active=store.is_active,
        is_accepting_orders=store.is_accepting_orders,
        position=store.position,
        created_at=store.created_at,
        updated_at=store.updated_at,
        operating_hours=[],
    )
    return APIResponse(data=out)


@router.get("/{store_id}", response_model=APIResponse[StoreDetailOut])
async def get_store(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """Get a store by ID with operating hours, special hours, config and tables."""
    store = await _get_store_or_404(db, store_id)

    hours_result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id == store_id)
    )
    special_result = await db.execute(
        select(StoreSpecialHours).where(StoreSpecialHours.store_id == store_id)
    )
    config_result = await db.execute(
        select(StoreConfiguration).where(StoreConfiguration.store_id == store_id)
    )
    tables_result = await db.execute(
        select(DiningTable).where(
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )

    store_dict = {c: getattr(store, c) for c in store.__table__.columns.keys()}
    store_dict["operating_hours"] = [
        StoreOperatingHoursOut.model_validate(h) for h in hours_result.scalars().all()
    ]
    store_dict["special_hours"] = [
        StoreSpecialHoursOut.model_validate(h) for h in special_result.scalars().all()
    ]
    store_dict["configuration"] = [
        _StoreConfigurationOut.model_validate(c) for c in config_result.scalars().all()
    ]
    # Enrich table statuses
    tables_enriched = []
    for t in tables_result.scalars().all():
        out = DiningTableOut.model_validate(t)
        out.current_status = await _enrich_table_status(db, t)
        tables_enriched.append(out)
    store_dict["dining_tables"] = tables_enriched

    return APIResponse(data=StoreDetailOut.model_validate(store_dict))


@router.patch("/{store_id}", response_model=APIResponse[StoreOut])
async def update_store(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    data: StoreUpdate,
):
    """Update a store (partial)."""
    store = await _get_store_or_404(db, store_id)

    update_data = data.model_dump(exclude_unset=True)
    hours_data = update_data.pop("operating_hours", None)

    for field, value in update_data.items():
        setattr(store, field, value)

    # Update operating hours if provided
    if hours_data is not None:
        existing = await db.execute(
            select(StoreOperatingHours).where(StoreOperatingHours.store_id == store.id)
        )
        for h in existing.scalars().all():
            await db.delete(h)
        await db.flush()
        for h in hours_data:
            open_str = h.get("open_time", "08:00")
            close_str = h.get("close_time", "22:00")
            lot_str = h.get("last_order_time")
            db.add(StoreOperatingHours(
                store_id=store.id,
                day_of_week=h.get("day_of_week", 0),
                open_time=time.fromisoformat(open_str) if isinstance(open_str, str) else open_str,
                close_time=time.fromisoformat(close_str) if isinstance(close_str, str) else close_str,
                is_closed=h.get("is_closed", False),
                is_24_hours=h.get("is_24_hours", False),
                last_order_time=time.fromisoformat(lot_str) if isinstance(lot_str, str) and lot_str else (lot_str if lot_str else None),
            ))

    store.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await auto_translate_record(db, "stores", store.id, {"store_name": store.store_name})

    hours_result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id == store.id)
    )
    hours = [{
        "id": h.id, "store_id": h.store_id, "day_of_week": h.day_of_week,
        "open_time": str(h.open_time), "close_time": str(h.close_time),
        "is_closed": h.is_closed, "is_24_hours": h.is_24_hours,
        "last_order_time": str(h.last_order_time) if h.last_order_time else None,
        "created_at": h.created_at, "updated_at": h.updated_at,
    } for h in hours_result.scalars().all()]
    out = StoreOut(
        id=store.id,
        store_code=store.store_code,
        store_name=store.store_name,
        slug=store.slug,
        brand_name=store.brand_name,
        address_line_1=store.address_line_1,
        address_line_2=store.address_line_2,
        city=store.city,
        state_province=store.state_province,
        postal_code=store.postal_code,
        country_code=store.country_code,
        latitude=store.latitude,
        longitude=store.longitude,
        phone_number=store.phone_number,
        email_address=store.email_address,
        timezone=store.timezone,
        currency_code=store.currency_code,
        logo_url=store.logo_url,
        banner_image_url=store.banner_image_url,
        pickup_lead_minutes=store.pickup_lead_minutes,
        delivery_radius_km=store.delivery_radius_km,
        first_order_minutes_after_open=store.first_order_minutes_after_open,
        last_order_minutes_before_close=store.last_order_minutes_before_close,
        is_active=store.is_active,
        is_accepting_orders=store.is_accepting_orders,
        position=store.position,
        created_at=store.created_at,
        updated_at=store.updated_at,
        operating_hours=hours,
    )
    return APIResponse(data=out)


@router.delete("/{store_id}", response_model=APIResponse[dict])
async def delete_store(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """Soft-delete a store."""
    store = await _get_store_or_404(db, store_id)

    store.is_active = False
    store.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    await delete_translations(db, "stores", store_id)
    return APIResponse(data={"id": store.id, "deleted": True})


# ---------------------------------------------------------------------------
# Operating hours
# ---------------------------------------------------------------------------

@router.get(
    "/{store_id}/operating-hours",
    response_model=APIResponse[list[StoreOperatingHoursOut]],
)
async def list_operating_hours(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """List operating hours for a store."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id == store_id)
    )
    hours = result.scalars().all()
    return APIResponse(data=[StoreOperatingHoursOut.model_validate(h) for h in hours])


@router.put(
    "/{store_id}/operating-hours",
    response_model=APIResponse[list[StoreOperatingHoursOut]],
)
async def replace_operating_hours(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    data: list[StoreOperatingHoursBase],
):
    """Bulk replace operating hours for a store (exactly 7 days)."""
    await _get_store_or_404(db, store_id)

    if len(data) != 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly 7 operating hours entries required",
        )

    days = {item.day_of_week for item in data}
    if days != set(range(7)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operating hours must include all 7 days (0–6)",
        )

    await db.execute(
        delete(StoreOperatingHours).where(StoreOperatingHours.store_id == store_id)
    )

    for item in data:
        db.add(
            StoreOperatingHours(
                store_id=store_id,
                day_of_week=item.day_of_week,
                open_time=item.open_time,
                close_time=item.close_time,
                is_closed=item.is_closed,
                is_24_hours=item.is_24_hours,
                last_order_time=item.last_order_time,
            )
        )

    await db.commit()

    result = await db.execute(
        select(StoreOperatingHours).where(StoreOperatingHours.store_id == store_id)
    )
    hours = result.scalars().all()
    return APIResponse(data=[StoreOperatingHoursOut.model_validate(h) for h in hours])


# ---------------------------------------------------------------------------
# Dining tables
# ---------------------------------------------------------------------------

@router.get(
    "/{store_id}/tables",
    response_model=APIResponse[list[DiningTableOut]],
)
async def list_tables(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """List dining tables for a store."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(DiningTable).where(
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    tables = result.scalars().all()

    # Enrich with current_status from table_status_snapshot
    table_ids = [t.id for t in tables]
    snap_query = (
        select(TableStatusSnapshot)
        .where(TableStatusSnapshot.table_id.in_(table_ids))
        .order_by(TableStatusSnapshot.table_id)
    )
    snap_result = await db.execute(snap_query)
    snap_map = {s.table_id: s for s in snap_result.scalars().all()}

    # Batch-fetch active orders
    active_order_ids = [snap.current_order_id for snap in snap_map.values() if snap.current_order_id]
    order_map = {}
    if active_order_ids:
        o_result = await db.execute(
            select(Order.id, Order.order_number, Order.status, Order.payment_status, Order.total_amount)
            .where(Order.id.in_(active_order_ids))
        )
        order_map = {r[0]: r for r in o_result.all()}

    items = []
    for t in tables:
        out = DiningTableOut.model_validate(t)
        snap = snap_map.get(t.id)
        out.current_status = snap.status if snap else "available"
        if snap and snap.current_order_id:
            out.active_order_id = snap.current_order_id
            o = order_map.get(snap.current_order_id)
            if o:
                out.active_order = {
                    "id": o[0],
                    "order_number": o[1],
                    "status": o[2],
                    "payment_status": o[3],
                    "total_amount": float(o[4]) if o[4] else 0,
                }
        items.append(out)
    return APIResponse(data=items)


async def _enrich_table_status(db, table):
    """Look up current_status from table_status_snapshot."""
    result = await db.execute(
        select(TableStatusSnapshot.status).where(TableStatusSnapshot.table_id == table.id)
    )
    status = result.scalar_one_or_none()
    return status or "available"


@router.post(
    "/{store_id}/tables",
    response_model=APIResponse[DiningTableOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_table(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    data: DiningTableCreate,
):
    """Create a dining table for a store."""
    await _get_store_or_404(db, store_id)

    qr_token = data.qr_code_token or uuid4().hex

    table = DiningTable(
        store_id=store_id,
        table_number=data.table_number,
        display_name=data.display_name,
        capacity=data.capacity,
        qr_code_token=qr_token,
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    out = DiningTableOut.model_validate(table)
    out.current_status = await _enrich_table_status(db, table)
    return APIResponse(data=out)


@router.patch(
    "/{store_id}/tables/{table_id}",
    response_model=APIResponse[DiningTableOut],
)
async def update_table(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    table_id: int,
    data: DiningTableUpdate,
):
    """Update a dining table."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    update_data = data.model_dump(exclude_unset=True)
    current_status = update_data.pop("current_status", None)

    for field, value in update_data.items():
        setattr(table, field, value)

    if current_status is not None:
        existing_snap = await db.execute(
            select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == table.id)
        )
        snap = existing_snap.scalar_one_or_none()
        if snap:
            snap.status = current_status
        else:
            db.add(TableStatusSnapshot(
                table_id=table.id,
                store_id=store_id,
                status=current_status,
            ))

    await db.commit()
    await db.refresh(table)
    out = DiningTableOut.model_validate(table)
    out.current_status = await _enrich_table_status(db, table)
    return APIResponse(data=out)


@router.delete(
    "/{store_id}/tables/{table_id}",
    response_model=APIResponse[dict],
)
async def delete_table(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    table_id: int,
):
    """Soft-delete a dining table."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    table.is_active = False
    table.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": table.id, "deleted": True})


# ---------------------------------------------------------------------------
# QR Code generation
# ---------------------------------------------------------------------------

@router.post(
    "/{store_id}/tables/{table_id}/generate-qr",
    response_model=APIResponse[DiningTableOut],
)
async def generate_table_qr(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    table_id: int,
):
    """Generate QR code URL for a dining table."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    # Use existing token or generate new one
    token = table.qr_code_token or uuid4().hex
    table.qr_code_token = token
    table.qr_code_image_url = f"loka:table:{token}"
    table.qr_generated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(table)
    out = DiningTableOut.model_validate(table)
    out.current_status = await _enrich_table_status(db, table)
    return APIResponse(data=out)


@router.get(
    "/{store_id}/tables/{table_id}/qr-image",
    response_class=Response,
)
async def download_table_qr(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
    table_id: int,
):
    """Download QR code as PNG image."""
    await _get_store_or_404(db, store_id)

    result = await db.execute(
        select(DiningTable).where(
            DiningTable.id == table_id,
            DiningTable.store_id == store_id,
            DiningTable.deleted_at.is_(None),
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    if not table.qr_code_image_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="QR code not generated yet")

    try:
        import qrcode as qrlib
        from io import BytesIO

        img = qrlib.make(table.qr_code_image_url, box_size=10, border=2)
        buf = BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/png")
    except ImportError:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="qrcode package not installed")
