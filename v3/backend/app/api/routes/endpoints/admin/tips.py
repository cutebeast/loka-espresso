"""Tip allocation endpoints."""
from decimal import Decimal
from datetime import date, datetime, time, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.routes.deps import CurrentAdmin, DBDependency, require_store_admin
from app.models.staff import StaffProfile, TipAllocation
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse, Money, BaseSchema

router = APIRouter(prefix="/admin/staff", tags=["admin — staff"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class TipAllocationCreate(BaseSchema):
    order_id: int
    staff_id: int
    tip_amount: Money = Field(..., ge=0)
    tip_percentage: float | None = Field(None, ge=0, le=1)
    allocation_type: Literal["even_split", "percentage", "fixed"] = "even_split"


class TipAllocationOut(BaseSchema):
    model_config = {"from_attributes": True}

    id: int
    order_id: int
    staff_id: int | None  # None = pooled tip, not yet distributed
    tip_amount: Money
    tip_percentage: float | None
    allocation_type: str
    created_at: datetime
    store_id: int | None = None
    store_name: str | None = None
    staff_name: str | None = None
    payment_method: str | None = None
    total_tip: float = 0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tips", response_model=APIResponse[PaginatedResponse[TipAllocationOut]])
async def list_tip_allocations(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    order_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List tip allocations with filters."""
    base_stmt = select(TipAllocation).outerjoin(StaffProfile)
    count_stmt = select(func.count(TipAllocation.id)).outerjoin(StaffProfile)

    if store_id is not None:
        base_stmt = base_stmt.where(StaffProfile.store_id == store_id)
        count_stmt = count_stmt.where(StaffProfile.store_id == store_id)
    if order_id is not None:
        base_stmt = base_stmt.where(TipAllocation.order_id == order_id)
        count_stmt = count_stmt.where(TipAllocation.order_id == order_id)
    if date_from is not None:
        dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(TipAllocation.created_at >= dt_from)
        count_stmt = count_stmt.where(TipAllocation.created_at >= dt_from)
    if date_to is not None:
        dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(TipAllocation.created_at <= dt_to)
        count_stmt = count_stmt.where(TipAllocation.created_at <= dt_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt
        .options(joinedload(TipAllocation.staff).joinedload(StaffProfile.store))
        .order_by(TipAllocation.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    allocations = result.unique().scalars().all()

    # Enrich with store info and order payment details
    staff_ids = {a.staff_id for a in allocations if a.staff_id is not None}
    name_map: dict = {}
    if staff_ids:
        name_rows = await db.execute(
            select(StaffProfile.id, StaffProfile.display_name).where(StaffProfile.id.in_(staff_ids))
        )
        name_map = {r[0]: r[1] for r in name_rows.all()}
    from app.models.payment import Payment
    from app.models.order import Order
    from app.models.store import Store
    order_ids = {a.order_id for a in allocations}
    pay_map: dict = {}
    order_store_map: dict = {}
    if order_ids:
        pay_rows = await db.execute(
            select(Payment.order_id, Payment.payment_method_type)
            .where(Payment.order_id.in_(order_ids), Payment.status.in_(("captured", "partially_refunded", "refunded")))
            .order_by(Payment.id.desc())
        )
        for oid, pmt in pay_rows.all():
            pay_map.setdefault(oid, pmt)
        os_rows = await db.execute(
            select(Order.id, Order.store_id).where(Order.id.in_(order_ids))
        )
        order_store_map = {r[0]: r[1] for r in os_rows.all()}
    store_ids = {sid for sid in order_store_map.values() if sid}
    store_name_map: dict = {}
    if store_ids:
        sn_rows = await db.execute(
            select(Store.id, Store.store_name).where(Store.id.in_(store_ids))
        )
        store_name_map = {r[0]: r[1] for r in sn_rows.all()}

    items_out = []
    for a in allocations:
        out = TipAllocationOut.model_validate(a)
        if a.staff and a.staff.store:
            out.store_id = a.staff.store.id
            out.store_name = a.staff.store.store_name
        else:
            # Pooled tips have no staff — derive the store from the order
            oid_store = order_store_map.get(a.order_id)
            out.store_id = oid_store
            out.store_name = store_name_map.get(oid_store)
        out.staff_name = name_map.get(a.staff_id)
        out.payment_method = pay_map.get(a.order_id)
        out.total_tip = a.tip_amount
        items_out.append(out)

    return APIResponse(
        data=PaginatedResponse(
            items=items_out,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/tips",
    response_model=APIResponse[TipAllocationOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_tip_allocation(
    db: DBDependency,
    admin: CurrentAdmin,
    data: TipAllocationCreate,
):
    """Create a tip allocation for a staff member."""
    # Verify staff exists
    staff_result = await db.execute(
        select(StaffProfile).where(
            StaffProfile.id == data.staff_id,
            StaffProfile.deleted_at.is_(None),
        )
    )
    staff_profile = staff_result.scalar_one_or_none()
    if staff_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    await require_store_admin(db, admin, staff_profile.store_id)

    allocation = TipAllocation(**data.model_dump())
    db.add(allocation)
    await db.commit()
    await db.refresh(allocation)
    return APIResponse(data=TipAllocationOut.model_validate(allocation))


@router.get("/tips/{id}", response_model=APIResponse[TipAllocationOut])
async def get_tip_allocation(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a single tip allocation by ID."""
    result = await db.execute(
        select(TipAllocation).where(TipAllocation.id == id)
    )
    allocation = result.scalar_one_or_none()
    if allocation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tip allocation not found"
        )
    return APIResponse(data=TipAllocationOut.model_validate(allocation))
