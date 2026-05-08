"""Admin store management endpoints."""

from datetime import date, datetime, time, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.store import (
    DiningTable,
    Store,
    StoreConfiguration,
    StoreOperatingHours,
    StoreSpecialHours,
)
from app.schemas.base import APIResponse, PaginatedResponse
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
    page_size: int = Query(20, ge=1, le=100),
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

    stmt = base_stmt.order_by(Store.id.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = [StoreOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=page_size,
            total_pages=(total + page_size - 1) // page_size,
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
                last_order_time=None,
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
    await db.refresh(store)
    return APIResponse(data=StoreOut.model_validate(store))


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
    store_dict["dining_tables"] = [
        DiningTableOut.model_validate(t) for t in tables_result.scalars().all()
    ]

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
    for field, value in update_data.items():
        setattr(store, field, value)

    store.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(store)
    return APIResponse(data=StoreOut.model_validate(store))


@router.delete("/{store_id}", response_model=APIResponse[dict])
async def delete_store(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int,
):
    """Soft-delete a store."""
    store = await _get_store_or_404(db, store_id)

    store.deleted_at = datetime.now(timezone.utc)
    store.is_active = False
    await db.commit()
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
                is_24_hours=False,
                last_order_time=None,
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
    return APIResponse(data=[DiningTableOut.model_validate(t) for t in tables])


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
    return APIResponse(data=DiningTableOut.model_validate(table))


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
    for field, value in update_data.items():
        setattr(table, field, value)

    await db.commit()
    await db.refresh(table)
    return APIResponse(data=DiningTableOut.model_validate(table))


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

    table.deleted_at = datetime.now(timezone.utc)
    table.is_active = False
    await db.commit()
    return APIResponse(data={"id": table.id, "deleted": True})
