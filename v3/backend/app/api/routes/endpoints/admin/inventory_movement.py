"""Inventory movement log endpoints."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency, require_store_admin
from app.core.business_time import day_start_utc, day_end_utc
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock, WastageReport
from app.schemas.base import APIResponse, PaginatedResponse, BaseSchema

router = APIRouter(prefix="/admin/inventory", tags=["admin — inventory"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class MovementLogCreate(BaseSchema):
    inventory_item_id: int
    store_id: int
    movement_type: Literal["in", "out", "adjustment", "waste", "return", "transfer_in", "transfer_out"]
    quantity_delta: float
    reason: str = Field(..., max_length=500)
    reference_type: str | None = Field(None, max_length=50)
    reference_id: int | None = None
    unit_cost_at_movement: float | None = Field(None, ge=0)


class MovementLogOut(BaseSchema):
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
    item_name: str | None = None
    image_urls: list[str] | None = None
    performed_by_name: str | None = None


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
        dt_from = day_start_utc(date_from)
        base_stmt = base_stmt.where(InventoryMovementLog.created_at >= dt_from)
        count_stmt = count_stmt.where(InventoryMovementLog.created_at >= dt_from)
    if date_to is not None:
        dt_to = day_end_utc(date_to)
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
    rows = result.scalars().all()
    items = [MovementLogOut.model_validate(r) for r in rows]

    # Enrich with item names (list view has no join)
    if rows:
        from app.models.inventory import InventoryItem
        name_rows = await db.execute(
            select(InventoryItem.id, InventoryItem.item_name).where(
                InventoryItem.id.in_({r.inventory_item_id for r in rows})
            )
        )
        name_map = {r[0]: r[1] for r in name_rows.all()}
        for item, mv in zip(items, rows):
            item.item_name = name_map.get(mv.inventory_item_id)

        # Enrich with performer names (staff-submitted rows have no performer)
        performer_ids = {r.performed_by for r in rows if r.performed_by is not None}
        if performer_ids:
            from app.models.iam import AdminAccount
            perf_rows = await db.execute(
                select(AdminAccount.id, AdminAccount.display_name).where(
                    AdminAccount.id.in_(performer_ids)
                )
            )
            perf_map = {r[0]: r[1] for r in perf_rows.all()}
            for item, mv in zip(items, rows):
                item.performed_by_name = perf_map.get(mv.performed_by) if mv.performed_by else None

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
    await require_store_admin(db, admin, data.store_id)

    # Verify item exists and is not deleted
    item_result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.inventory_item_id,
            InventoryItem.deleted_at.is_(None),
        )
    )
    item = item_result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    # Find or create per-store stock record
    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id == data.inventory_item_id,
            InventoryStock.store_id == data.store_id,
        ).with_for_update()
    )
    stock = stock_result.scalar_one_or_none()
    if stock is None:
        stock = InventoryStock(
            inventory_item_id=data.inventory_item_id,
            store_id=data.store_id,
            current_stock=0,
            reserved_stock=0,
            reorder_level=0,
            reorder_quantity=0,
            par_level=0,
        )
        db.add(stock)
        await db.flush()

    # Calculate new stock after movement (DB stock is Decimal; schema gives
    # float — convert explicitly or `Decimal + float` raises TypeError)
    delta = Decimal(str(data.quantity_delta))
    new_stock = stock.current_stock + delta
    if new_stock < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Movement would result in negative stock",
        )

    movement_cost = None
    if data.unit_cost_at_movement is not None:
        movement_cost = abs(delta) * Decimal(str(data.unit_cost_at_movement))

    movement = InventoryMovementLog(
        store_id=data.store_id,
        inventory_item_id=data.inventory_item_id,
        movement_type=data.movement_type,
        quantity_delta=delta,
        stock_after=new_stock,
        reserved_delta=0,
        reserved_after=str(stock.reserved_stock),
        reason=data.reason,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
        unit_cost_at_movement=data.unit_cost_at_movement,
        movement_cost=movement_cost,
        performed_by=admin.id,
    )

    # Update stock record
    stock.current_stock = new_stock

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


# ---------------------------------------------------------------------------
# Wastage reports (staff-submitted, with photo evidence + supervisor review)
# ---------------------------------------------------------------------------

class WastageReportOut(BaseSchema):
    model_config = {"from_attributes": True}

    id: int
    store_id: int
    menu_item_id: int | None
    inventory_item_id: int | None
    item_name: str
    quantity: float
    unit_of_measure: str | None
    reason: str
    image_urls: list[str] | None
    reported_by: str
    status: str
    verified_by: str | None
    verified_at: datetime | None
    verified_notes: str | None
    created_at: datetime
    store_name: str | None = None


class WastageReportReview(BaseSchema):
    status: Literal["verified", "flagged", "pending"]
    verified_notes: str | None = Field(None, max_length=500)


@router.get("/wastage-reports", response_model=APIResponse[PaginatedResponse[WastageReportOut]])
async def list_wastage_reports(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List staff wastage reports with store/status/date filters (business-local days)."""
    base_stmt = select(WastageReport)
    count_stmt = select(func.count(WastageReport.id))

    if store_id is not None:
        base_stmt = base_stmt.where(WastageReport.store_id == store_id)
        count_stmt = count_stmt.where(WastageReport.store_id == store_id)
    if status is not None:
        base_stmt = base_stmt.where(WastageReport.status == status)
        count_stmt = count_stmt.where(WastageReport.status == status)
    if date_from is not None:
        base_stmt = base_stmt.where(WastageReport.created_at >= day_start_utc(date_from))
        count_stmt = count_stmt.where(WastageReport.created_at >= day_start_utc(date_from))
    if date_to is not None:
        base_stmt = base_stmt.where(WastageReport.created_at <= day_end_utc(date_to))
        count_stmt = count_stmt.where(WastageReport.created_at <= day_end_utc(date_to))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    result = await db.execute(
        base_stmt.order_by(WastageReport.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = result.scalars().all()

    store_ids = {r.store_id for r in rows}
    store_names: dict[int, str] = {}
    if store_ids:
        from app.models.store import Store
        s_result = await db.execute(select(Store.id, Store.store_name).where(Store.id.in_(store_ids)))
        store_names = {sid: name for sid, name in s_result.all()}

    items = []
    for r in rows:
        out = WastageReportOut.model_validate(r)
        out.store_name = store_names.get(r.store_id)
        items.append(out)

    return APIResponse(data=PaginatedResponse(
        items=items, total=total, page=page, per_page=per_page,
        total_pages=max(1, (total + per_page - 1) // per_page),
    ))


@router.patch("/wastage-reports/{id}", response_model=APIResponse[WastageReportOut])
async def review_wastage_report(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: WastageReportReview,
):
    """Supervisor verifies or flags a wastage report."""
    result = await db.execute(select(WastageReport).where(WastageReport.id == id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wastage report not found")

    await require_store_admin(db, admin, report.store_id)

    report.status = data.status
    if data.verified_notes is not None:
        report.verified_notes = data.verified_notes
    if data.status == "verified":
        from datetime import timezone
        report.verified_at = datetime.now(timezone.utc)
        report.verified_by = admin.email if hasattr(admin, "email") else f"Admin #{admin.id}"

    await db.commit()
    await db.refresh(report)
    return APIResponse(data=WastageReportOut.model_validate(report))
