"""Staff reservation endpoints (list, status update)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.models.customer import Customer
from app.models.enums import ReservationStatus
from app.models.store import DiningTable, Reservation
from app.schemas.base import APIResponse
from app.schemas.reservation import ReservationStatusUpdate
from app.api.routes.endpoints.admin.reservations import (
    _check_table_availability,
    _get_bookable_table_or_400,
)

router = APIRouter(tags=["staff — reservations"])


@router.get("/staff/reservations")
async def staff_list_reservations(
    staff: CurrentStaff,
    db: DBDependency,
    status_filter: str | None = Query(None, alias="status"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
):
    """List reservations for the staff member's store."""
    stmt = (
        select(Reservation, Customer, DiningTable)
        .outerjoin(Customer, Customer.id == Reservation.customer_id)
        .outerjoin(DiningTable, DiningTable.id == Reservation.dining_table_id)
        .where(Reservation.store_id == staff.store_id)
    )
    if status_filter:
        if status_filter not in ReservationStatus.enums:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid: {ReservationStatus.enums}",
            )
        stmt = stmt.where(Reservation.status == status_filter)
    if date_from:
        from datetime import date as date_cls
        try:
            parsed_from = date_cls.fromisoformat(date_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date")
        stmt = stmt.where(Reservation.reservation_date >= parsed_from)
    if date_to:
        from datetime import date as date_cls
        try:
            parsed_to = date_cls.fromisoformat(date_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date")
        stmt = stmt.where(Reservation.reservation_date <= parsed_to)
    stmt = stmt.order_by(Reservation.reservation_date.desc(), Reservation.reservation_time.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    rows = result.all()
    return APIResponse(data=[
        {
            "id": r.id,
            "store_id": r.store_id,
            "customer_id": r.customer_id,
            "customer_name": c.display_name if c else None,
            "customer_phone": c.phone_number if c else None,
            "party_size": r.party_size,
            "reservation_date": r.reservation_date.isoformat() if r.reservation_date else None,
            "reservation_time": r.reservation_time.isoformat() if r.reservation_time else None,
            "duration_minutes": r.duration_minutes,
            "status": r.status,
            "dining_table_id": r.dining_table_id,
            "table_number": t.table_number if t else None,
            "special_requests": r.special_requests,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, c, t in rows
    ])


# ── Staff reservation operations ──

@router.patch("/staff/reservations/{reservation_id}/status")
async def staff_update_reservation_status(
    staff: CurrentStaff,
    db: DBDependency,
    reservation_id: int,
    data: ReservationStatusUpdate,
):
    """Update reservation status (staff endpoint)."""
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.store_id == staff.store_id,
        )
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    reservation.status = data.status
    if data.dining_table_id is not None:
        await _get_bookable_table_or_400(db, data.dining_table_id, reservation.store_id)
        reservation.dining_table_id = data.dining_table_id
    if data.status in ("confirmed", "seated") and reservation.dining_table_id is not None:
        # Confirming/seating always re-validates the effective table and
        # re-checks the slot, even when the table was assigned earlier.
        if data.dining_table_id is None:
            await _get_bookable_table_or_400(db, reservation.dining_table_id, reservation.store_id)
        await _check_table_availability(
            db, reservation.dining_table_id, reservation.reservation_date,
            reservation.reservation_time, reservation.duration_minutes,
            exclude_reservation_id=reservation.id,
        )
    reservation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": reservation.id, "status": reservation.status})
