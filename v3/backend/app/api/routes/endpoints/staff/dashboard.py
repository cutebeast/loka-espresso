"""Staff dashboard and store configuration endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.core.business_time import BUSINESS_TZ
from app.models.order import Order
from app.models.staff import StaffTimeEvent
from app.models.store import Reservation, Store, StoreConfiguration, TableStatusSnapshot
from app.schemas.base import APIResponse

router = APIRouter(tags=["staff — dashboard"])


# ── Dashboard ──

@router.get("/staff/dashboard")
async def staff_dashboard(db: DBDependency, staff: CurrentStaff):
    store_id = staff.store_id

    pending = (await db.execute(
        select(func.count(Order.id)).where(
            Order.store_id == store_id,
            Order.status.in_(["pending", "confirmed", "preparing"]),
            Order.deleted_at.is_(None),
        )
    )).scalar() or 0

    occupied = (await db.execute(
        select(func.count(TableStatusSnapshot.table_id)).where(
            TableStatusSnapshot.store_id == store_id,
            TableStatusSnapshot.status.in_(["occupied", "reserved"]),
        )
    )).scalar() or 0

    # "Today" follows the business timezone (MYT), not UTC.
    today_resv = (await db.execute(
        select(func.count(Reservation.id)).where(
            Reservation.store_id == store_id,
            Reservation.reservation_date == datetime.now(BUSINESS_TZ).date(),
            Reservation.status.notin_([
                "cancelled_by_guest", "cancelled_by_merchant", "no_show"
            ]),
        )
    )).scalar() or 0

    # Check clock status
    clock = await db.execute(
        select(StaffTimeEvent).where(
            StaffTimeEvent.staff_id == staff.id,
        ).order_by(StaffTimeEvent.id.desc()).limit(1)
    )
    last_event = clock.scalar_one_or_none()
    clock_status = "out"
    shift_start = None
    if last_event:
        if last_event.event_type == "clock_in":
            clock_status = "in"
            shift_start = last_event.created_at
        elif last_event.event_type == "start_break":
            clock_status = "break"
            shift_start = last_event.created_at

    # Query store name separately (avoid lazy load)
    store_name = (await db.execute(select(Store.store_name).where(Store.id == staff.store_id))).scalar_one_or_none() or ""

    return APIResponse(data={
        "pending_orders": pending,
        "occupied_tables": occupied,
        "today_reservations": today_resv,
        "clock_status": clock_status,
        "current_shift_start": shift_start.isoformat() if shift_start else None,
        "store_name": store_name,
        "staff_name": staff.display_name,
        "store_id": store_id,
    })


# ── Staff Store Config (POS display) ──

@router.get("/staff/store")
async def staff_store_config(db: DBDependency, staff: CurrentStaff):
    """Return the active store's public details plus POS fee configuration."""
    store = await db.get(Store, staff.store_id)
    if not store or store.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Store not found")

    config_result = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store.id,
            StoreConfiguration.config_key.in_([
                "order.service_charge",
                "order.tax_rate",
                "pos.customer_display.left",
            ]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_result.scalars().all()}

    def _to_float(value, default=0.0):
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    return APIResponse(data={
        "id": store.id,
        "store_name": store.store_name,
        "brand_name": store.brand_name,
        "currency_code": store.currency_code,
        "service_charge": _to_float(config_map.get("order.service_charge"), 0.0),
        "tax_rate": _to_float(config_map.get("order.tax_rate"), 0.0),
        "display_left": int(_to_float(config_map.get("pos.customer_display.left"), 1920.0)),
        # Per-store shared secret for the public customer-display poll:
        # GET /api/staff/pos/display-state?store_id=<id>&key=<display_key>
        "display_key": store.display_key,
    })
