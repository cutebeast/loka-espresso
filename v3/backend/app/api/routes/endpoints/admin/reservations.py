"""Admin and public reservation endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.routes.deps import ActiveCustomer, CurrentAdmin, DBDependency, get_staff_store_id_from_request, _get_admin_store_ids, _get_admin_role_keys
from app.models.customer import Customer
from app.models.store import DiningTable, Reservation, Store
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.reservation import (
    CustomerReservationCreate,
    ReservationCreate,
    ReservationOut,
    ReservationStatusUpdate,
    ReservationUpdate,
)

reservations_router = APIRouter()
public_reservations_router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_reservation_or_404(db, reservation_id: int) -> Reservation:
    result = await db.execute(
        select(Reservation).where(Reservation.id == reservation_id)
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found"
        )
    return reservation


async def _check_table_availability(
    db,
    dining_table_id: int,
    reservation_date: date,
    reservation_time,
    duration_minutes: int,
    exclude_reservation_id: int | None = None,
) -> None:
    """Reject double-booking: same table, same date, overlapping time window."""
    start_minutes = reservation_time.hour * 60 + reservation_time.minute
    end_minutes = start_minutes + (duration_minutes or 90)

    filters = [
        Reservation.dining_table_id == dining_table_id,
        Reservation.reservation_date == reservation_date,
        Reservation.status.in_(["confirmed", "seated"]),
    ]
    if exclude_reservation_id is not None:
        filters.append(Reservation.id != exclude_reservation_id)
    result = await db.execute(select(Reservation).where(*filters))
    for existing in result.scalars().all():
        ex_start = existing.reservation_time.hour * 60 + existing.reservation_time.minute
        ex_end = ex_start + (existing.duration_minutes or 90)
        if start_minutes < ex_end and ex_start < end_minutes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Table is already booked for an overlapping time slot",
            )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@reservations_router.get(
    "", response_model=APIResponse[PaginatedResponse[ReservationOut]]
)
async def list_reservations(
    request: Request,
    db: DBDependency,
    admin: CurrentAdmin,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    store_id: int | None = Query(None),
):
    """List reservations (admin)."""
    # Enforce store scoping for staff tokens
    staff_store_id = get_staff_store_id_from_request(request)
    if staff_store_id is not None:
        if store_id is not None and store_id != staff_store_id:
            raise HTTPException(status_code=403, detail="Access denied for this store")
        store_id = staff_store_id
    else:
        # Admin token: enforce store scoping for non-HQ admins
        admin_store_ids = await _get_admin_store_ids(db, admin.id)
        admin_roles = await _get_admin_role_keys(db, admin.id)
        is_hq = bool(admin_roles & {"system_admin", "regional_manager", "readonly_analyst"})
        if not is_hq:
            if not admin_store_ids:
                # Non-HQ admin with no store assignments sees nothing
                return APIResponse(
                    data=PaginatedResponse(
                        items=[],
                        total=0,
                        page=page,
                        per_page=per_page,
                        total_pages=0,
                    )
                )
            if store_id is not None:
                if store_id not in admin_store_ids:
                    raise HTTPException(status_code=403, detail="Access denied for this store")
            else:
                store_id = admin_store_ids

    base_stmt = select(Reservation)
    count_stmt = select(func.count(Reservation.id))

    if isinstance(store_id, (list, set)):
        base_stmt = base_stmt.where(Reservation.store_id.in_(store_id))
        count_stmt = count_stmt.where(Reservation.store_id.in_(store_id))
    elif store_id is not None:
        base_stmt = base_stmt.where(Reservation.store_id == store_id)
        count_stmt = count_stmt.where(Reservation.store_id == store_id)
    if status is not None:
        base_stmt = base_stmt.where(Reservation.status == status)
        count_stmt = count_stmt.where(Reservation.status == status)
    if date_from is not None:
        base_stmt = base_stmt.where(Reservation.reservation_date >= date_from)
        count_stmt = count_stmt.where(Reservation.reservation_date >= date_from)
    if date_to is not None:
        base_stmt = base_stmt.where(Reservation.reservation_date <= date_to)
        count_stmt = count_stmt.where(Reservation.reservation_date <= date_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    from sqlalchemy.orm import joinedload
    stmt = (
        base_stmt
        .options(joinedload(Reservation.customer), joinedload(Reservation.store), joinedload(Reservation.dining_table))
        .order_by(Reservation.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    reservations = result.unique().scalars().all()

    items = []
    for r in reservations:
        out = ReservationOut.model_validate(r)
        if r.customer:
            out.customer_name = r.customer.display_name
            out.customer_phone = r.customer.phone_number
        if r.store:
            out.store_name = r.store.store_name
        if r.dining_table:
            out.table_number = r.dining_table.table_number
        items.append(out)

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@reservations_router.post(
    "", response_model=APIResponse[ReservationOut], status_code=status.HTTP_201_CREATED
)
async def create_reservation(
    db: DBDependency,
    admin: CurrentAdmin,
    data: ReservationCreate,
):
    """Create a reservation (admin)."""
    if data.dining_table_id is not None:
        await _check_table_availability(
            db, data.dining_table_id, data.reservation_date,
            data.reservation_time, data.duration_minutes,
        )
    reservation = Reservation(**data.model_dump())
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    return APIResponse(data=ReservationOut.model_validate(reservation))


@reservations_router.get("/{id}", response_model=APIResponse[ReservationOut])
async def get_reservation(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a reservation by ID."""
    reservation = await _get_reservation_or_404(db, id)
    return APIResponse(data=ReservationOut.model_validate(reservation))


@reservations_router.put("/{id}", response_model=APIResponse[ReservationOut])
async def update_reservation(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: ReservationUpdate,
):
    """Update a reservation (full or partial)."""
    reservation = await _get_reservation_or_404(db, id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(reservation, field, value)
    if reservation.dining_table_id is not None and reservation.status in ("confirmed", "seated"):
        await _check_table_availability(
            db, reservation.dining_table_id, reservation.reservation_date,
            reservation.reservation_time, reservation.duration_minutes,
            exclude_reservation_id=reservation.id,
        )
    reservation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reservation)
    return APIResponse(data=ReservationOut.model_validate(reservation))


@reservations_router.patch(
    "/{id}/status", response_model=APIResponse[ReservationOut]
)
async def update_reservation_status(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: ReservationStatusUpdate,
):
    """Update reservation status."""
    reservation = await _get_reservation_or_404(db, id)
    reservation.status = data.status
    if data.dining_table_id is not None and data.status == "confirmed":
        await _check_table_availability(
            db, data.dining_table_id, reservation.reservation_date,
            reservation.reservation_time, reservation.duration_minutes,
            exclude_reservation_id=reservation.id,
        )
        reservation.dining_table_id = data.dining_table_id
    reservation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reservation)
    return APIResponse(data=ReservationOut.model_validate(reservation))


@reservations_router.delete("/{id}", response_model=APIResponse[dict])
async def delete_reservation(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Delete/cancel a reservation."""
    reservation = await _get_reservation_or_404(db, id)
    await db.delete(reservation)
    await db.commit()
    return APIResponse(data={"id": reservation.id, "deleted": True})


# ---------------------------------------------------------------------------
# Public (customer) endpoints
# ---------------------------------------------------------------------------

@public_reservations_router.get(
    "", response_model=APIResponse[PaginatedResponse[ReservationOut]]
)
async def list_my_reservations(
    db: DBDependency,
    customer: ActiveCustomer,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List current customer's reservations."""
    base_stmt = select(Reservation).where(Reservation.customer_id == customer.id)
    count_stmt = select(func.count(Reservation.id)).where(
        Reservation.customer_id == customer.id
    )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(Reservation.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [ReservationOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@public_reservations_router.post(
    "", response_model=APIResponse[ReservationOut], status_code=status.HTTP_201_CREATED
)
async def create_my_reservation(
    db: DBDependency,
    customer: ActiveCustomer,
    data: CustomerReservationCreate,
):
    """Create a reservation for the current customer."""
    reservation = Reservation(
        **data.model_dump(),
        customer_id=customer.id,
        status="requested",
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    return APIResponse(data=ReservationOut.model_validate(reservation))


@public_reservations_router.get("/{id}", response_model=APIResponse[ReservationOut])
async def get_my_reservation(
    db: DBDependency,
    customer: ActiveCustomer,
    id: int,
):
    """Get current customer's reservation by ID."""
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == id, Reservation.customer_id == customer.id
        )
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found"
        )
    return APIResponse(data=ReservationOut.model_validate(reservation))


@public_reservations_router.delete("/{id}", response_model=APIResponse[dict])
async def cancel_my_reservation(
    db: DBDependency,
    customer: ActiveCustomer,
    id: int,
):
    """Cancel current customer's reservation."""
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == id, Reservation.customer_id == customer.id
        )
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found"
        )
    reservation.status = "cancelled_by_guest"
    reservation.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(reservation)
    return APIResponse(data={"id": reservation.id, "cancelled": True})
