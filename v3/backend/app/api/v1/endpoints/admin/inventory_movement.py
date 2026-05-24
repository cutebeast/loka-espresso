"""Inventory movement log endpoints."""

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.inventory import InventoryItem, InventoryMovementLog
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/inventory", tags=["admin — inventory"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class MovementLogCreate(BaseModel):
    inventory_item_id: int
    store_id: int
    movement_type: str
    quantity_delta: float
    reason: str = Field(..., max_length=500)
    reference_type: str | None = Field(None, max_length=50)
    reference_id: int | None = None
    unit_cost_at_movement: float | None = Field(None, ge=0)


class MovementLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    store_id: int
    inventory_item_id: int
    movement_type: str
    quantity_delta: float
    stock_after: float
    reserved_delta: float
    reserved_after: float
    reason: str
    reference_type: str | None
    reference_id: int | None
    unit_cost_at_movement: float | None
    movement_cost: float | None
    performed_by: int | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/movements", response_model=APIResponse[PaginatedResponse[MovementLogOut]])
async def list_movements(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    item_id: int | None = Query(None),
    movement_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List inventory movement logs with filters."""
    base_stmt = select(InventoryMovementLog)
    count_stmt = select(func.count(InventoryMovementLog.id))

    if store_id is not None:
        base_stmt = base_stmt.where(InventoryMovementLog.store_id == store_id)
        count_stmt = count_stmt.where(InventoryMovementLog.store_id == store_id)
    if item_id is not None:
        base_stmt = base_stmt.where(InventoryMovementLog.inventory_item_id == item_id)
        count_stmt = count_stmt.where(InventoryMovementLog.inventory_item_id == item_id)
    if movement_type is not None:
        base_stmt = base_stmt.where(InventoryMovementLog.movement_type == movement_type)
        count_stmt = count_stmt.where(InventoryMovementLog.movement_type == movement_type)
    if date_from is not None:
        dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(InventoryMovementLog.created_at >= dt_from)
        count_stmt = count_stmt.where(InventoryMovementLog.created_at >= dt_from)
    if date_to is not None:
        dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
        base_stmt = base_stmt.where(InventoryMovementLog.created_at <= dt_to)
        count_stmt = count_stmt.where(InventoryMovementLog.created_at <= dt_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(InventoryMovementLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    items = [MovementLogOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.post(
    "/movements",
    response_model=APIResponse[MovementLogOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_movement(
    db: DBDependency,
    admin: CurrentAdmin,
    data: MovementLogCreate,
):
    """Record an inventory movement (stock in, out, adjustment, waste)."""
    # Verify item exists and is not deleted
    item_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.inventory_item_id,
            InventoryItem.store_id == data.store_id,
            InventoryItem.deleted_at.is_(None),
        )
    )
    item = item_result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    # Calculate new stock after movement
    new_stock = float(item.current_stock) + data.quantity_delta
    if new_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Movement would result in negative stock",
        )

    movement_cost = None
    if data.unit_cost_at_movement is not None:
        movement_cost = abs(data.quantity_delta) * data.unit_cost_at_movement

    movement = InventoryMovementLog(
        store_id=data.store_id,
        inventory_item_id=data.inventory_item_id,
        movement_type=data.movement_type,
        quantity_delta=data.quantity_delta,
        stock_after=new_stock,
        reserved_delta=0,
        reserved_after=float(item.reserved_stock),
        reason=data.reason,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
        unit_cost_at_movement=data.unit_cost_at_movement,
        movement_cost=movement_cost,
        performed_by=admin.id,
    )

    # Update item stock
    item.current_stock = new_stock

    db.add(movement)
    await db.commit()
    await db.refresh(movement)
    return APIResponse(data=MovementLogOut.model_validate(movement))


@router.get("/movements/{id}", response_model=APIResponse[MovementLogOut])
async def get_movement(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a single movement log by ID."""
    result = await db.execute(
        select(InventoryMovementLog).where(InventoryMovementLog.id == id)
    )
    movement = result.scalar_one_or_none()
    if movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Movement log not found"
        )
    return APIResponse(data=MovementLogOut.model_validate(movement))
