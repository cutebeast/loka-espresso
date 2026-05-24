"""Tip allocation endpoints."""

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.staff import StaffProfile, TipAllocation
from app.models.store import Store
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/staff", tags=["admin — staff"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class TipAllocationCreate(BaseModel):
    order_id: int
    staff_id: int
    tip_amount: float = Field(..., ge=0)
    tip_percentage: float | None = Field(None, ge=0, le=1)
    allocation_type: str = "even_split"


class TipAllocationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    order_id: int
    staff_id: int
    tip_amount: float
    tip_percentage: float | None
    allocation_type: str
    created_at: datetime
    store_id: int | None = None
    store_name: str | None = None
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
    base_stmt = select(TipAllocation).join(StaffProfile)
    count_stmt = select(func.count(TipAllocation.id)).join(StaffProfile)

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
    items_out = []
    for a in allocations:
        out = TipAllocationOut.model_validate(a)
        if a.staff and a.staff.store:
            out.store_id = a.staff.store.id
            out.store_name = a.staff.store.store_name
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
    if staff_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

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
