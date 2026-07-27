"""Purchase order endpoints."""

from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock, PurchaseOrder, PurchaseOrderLine, Supplier
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/inventory", tags=["admin — inventory"])


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class PurchaseOrderLineCreate(BaseModel):
    inventory_item_id: int
    quantity_ordered: float = Field(..., gt=0)
    unit_cost: float = Field(..., gt=0)
    line_total: float | None = None


class PurchaseOrderLineOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    purchase_order_id: int
    inventory_item_id: int
    quantity_ordered: float
    quantity_received: float
    unit_cost: float
    line_total: float
    created_at: datetime


class PurchaseOrderCreate(BaseModel):
    store_id: int
    supplier_id: int
    po_number: str = Field(..., max_length=50)
    total_amount: float = Field(default=0, ge=0)
    expected_delivery: datetime | None = None
    notes: str | None = Field(None, max_length=500)
    lines: list[PurchaseOrderLineCreate] = []


class PurchaseOrderUpdate(BaseModel):
    supplier_id: int | None = None
    po_number: str | None = Field(None, max_length=50)
    total_amount: float | None = Field(None, ge=0)
    expected_delivery: datetime | None = None
    notes: str | None = Field(None, max_length=500)


class PurchaseOrderOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    store_id: int
    supplier_id: int
    po_number: str
    status: str
    total_amount: float
    expected_delivery: datetime | None
    actual_delivery: datetime | None
    notes: str | None
    created_by: int
    created_at: datetime
    updated_at: datetime
    supplier_name: str | None = None
    items_count: int = 0


class PurchaseOrderDetailOut(PurchaseOrderOut):
    lines: list[PurchaseOrderLineOut] = []


class ReceiveLine(BaseModel):
    line_id: int
    quantity_received: float = Field(..., ge=0)


class PurchaseOrderReceive(BaseModel):
    lines: list[ReceiveLine] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_po_or_404(db, po_id: int) -> PurchaseOrder:
    result = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.id == po_id)
    )
    po = result.scalar_one_or_none()
    if po is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found"
        )
    return po


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/purchase-orders", response_model=APIResponse[PaginatedResponse[PurchaseOrderOut]])
async def list_purchase_orders(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    supplier_id: int | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List purchase orders with filters."""
    base_stmt = select(PurchaseOrder)
    count_stmt = select(func.count(PurchaseOrder.id))

    if store_id is not None:
        base_stmt = base_stmt.where(PurchaseOrder.store_id == store_id)
        count_stmt = count_stmt.where(PurchaseOrder.store_id == store_id)
    if supplier_id is not None:
        base_stmt = base_stmt.where(PurchaseOrder.supplier_id == supplier_id)
        count_stmt = count_stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if status is not None:
        base_stmt = base_stmt.where(PurchaseOrder.status == status)
        count_stmt = count_stmt.where(PurchaseOrder.status == status)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = (
        base_stmt.order_by(PurchaseOrder.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [PurchaseOrderOut.model_validate(r) for r in rows]

    # Enrich with supplier names and line counts (list view has no joins)
    if rows:
        sup_rows = await db.execute(
            select(Supplier.id, Supplier.supplier_name).where(
                Supplier.id.in_({r.supplier_id for r in rows})
            )
        )
        sup_map = {r[0]: r[1] for r in sup_rows.all()}
        cnt_rows = await db.execute(
            select(PurchaseOrderLine.purchase_order_id, func.count())
            .where(PurchaseOrderLine.purchase_order_id.in_([r.id for r in rows]))
            .group_by(PurchaseOrderLine.purchase_order_id)
        )
        cnt_map = dict(cnt_rows.all())
        for item, po in zip(items, rows):
            item.supplier_name = sup_map.get(po.supplier_id)
            item.items_count = cnt_map.get(po.id, 0)

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
    "/purchase-orders",
    response_model=APIResponse[PurchaseOrderDetailOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_purchase_order(
    db: DBDependency,
    admin: CurrentAdmin,
    data: PurchaseOrderCreate,
):
    """Create a purchase order with lines."""
    # Verify supplier exists
    supplier_result = await db.execute(
        select(Supplier).where(
            Supplier.id == data.supplier_id,
            Supplier.store_id == data.store_id,
            Supplier.deleted_at.is_(None),
        )
    )
    if supplier_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )

    # Check PO number uniqueness
    existing = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.po_number == data.po_number)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Purchase order number already exists",
        )

    # Calculate total from lines if not provided
    lines_data = data.lines
    calculated_total = 0.0
    for line in lines_data:
        line_total = line.line_total if line.line_total is not None else (line.quantity_ordered * line.unit_cost)
        calculated_total += line_total

    total_amount = data.total_amount if data.total_amount > 0 else calculated_total

    po = PurchaseOrder(
        store_id=data.store_id,
        supplier_id=data.supplier_id,
        po_number=data.po_number,
        status="draft",
        total_amount=total_amount,
        expected_delivery=data.expected_delivery,
        notes=data.notes,
        created_by=admin.id,
    )
    db.add(po)
    await db.flush()
    await db.refresh(po)

    for line in lines_data:
        line_total = line.line_total if line.line_total is not None else (line.quantity_ordered * line.unit_cost)
        db.add(
            PurchaseOrderLine(
                purchase_order_id=po.id,
                inventory_item_id=line.inventory_item_id,
                quantity_ordered=line.quantity_ordered,
                quantity_received=0,
                unit_cost=line.unit_cost,
                line_total=line_total,
            )
        )

    await db.commit()
    await db.refresh(po)

    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )
    po_dict = {c: getattr(po, c) for c in po.__table__.columns.keys()}
    po_dict["lines"] = [
        PurchaseOrderLineOut.model_validate(l) for l in lines_result.scalars().all()
    ]

    return APIResponse(data=PurchaseOrderDetailOut.model_validate(po_dict))


@router.get("/purchase-orders/{id}", response_model=APIResponse[PurchaseOrderDetailOut])
async def get_purchase_order(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Get a purchase order with its lines."""
    po = await _get_po_or_404(db, id)

    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == id)
    )
    po_dict = {c: getattr(po, c) for c in po.__table__.columns.keys()}
    po_dict["lines"] = [
        PurchaseOrderLineOut.model_validate(l) for l in lines_result.scalars().all()
    ]

    return APIResponse(data=PurchaseOrderDetailOut.model_validate(po_dict))


@router.put("/purchase-orders/{id}", response_model=APIResponse[PurchaseOrderDetailOut])
async def update_purchase_order(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: PurchaseOrderUpdate,
):
    """Update a purchase order."""
    po = await _get_po_or_404(db, id)

    if po.status in ("received", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a received or cancelled purchase order",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(po, field, value)

    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(po)

    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == id)
    )
    po_dict = {c: getattr(po, c) for c in po.__table__.columns.keys()}
    po_dict["lines"] = [
        PurchaseOrderLineOut.model_validate(l) for l in lines_result.scalars().all()
    ]

    return APIResponse(data=PurchaseOrderDetailOut.model_validate(po_dict))


@router.patch("/purchase-orders/{id}/receive", response_model=APIResponse[PurchaseOrderDetailOut])
async def receive_purchase_order(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: PurchaseOrderReceive,
):
    """Mark purchase order as received (partial or full)."""
    po = await _get_po_or_404(db, id)

    if po.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot receive a cancelled purchase order",
        )

    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == id)
    )
    lines = {line.id: line for line in lines_result.scalars().all()}

    # When no lines specified, auto-receive all lines at full quantity
    if not data.lines:
        data.lines = [
            ReceiveLine(line_id=line_id, quantity_received=line.quantity_ordered)
            for line_id, line in lines.items()
        ]

    total_received = 0.0
    all_fully_received = True

    for recv in data.lines:
        line = lines.get(recv.line_id)
        if line is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PO line {recv.line_id} not found",
            )
        # Stock + movements are booked only for the newly-received delta, so
        # partial → follow-up receives never double-count. DB quantities are
        # Decimal, schema floats — convert explicitly.
        prev_received = Decimal(str(line.quantity_received or 0))
        delta_qty = Decimal(str(recv.quantity_received)) - prev_received
        if delta_qty < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Received quantity for line {recv.line_id} is below the previously received amount",
            )
        line.quantity_received = recv.quantity_received
        total_received += recv.quantity_received
        if recv.quantity_received < line.quantity_ordered:
            all_fully_received = False

        if delta_qty > 0:
            stock_result = await db.execute(
                select(InventoryStock).where(
                    InventoryStock.inventory_item_id == line.inventory_item_id,
                    InventoryStock.store_id == po.store_id,
                ).with_for_update()
            )
            stock = stock_result.scalar_one_or_none()
            if stock is None:
                stock = InventoryStock(
                    inventory_item_id=line.inventory_item_id,
                    store_id=po.store_id,
                    current_stock=0,
                    reserved_stock=0,
                    reorder_level=0,
                    reorder_quantity=0,
                    par_level=0,
                )
                db.add(stock)
                await db.flush()
            new_stock = stock.current_stock + delta_qty
            db.add(InventoryMovementLog(
                store_id=po.store_id,
                inventory_item_id=line.inventory_item_id,
                movement_type="in",
                quantity_delta=delta_qty,
                stock_after=new_stock,
                reserved_delta=0,
                reserved_after=stock.reserved_stock,
                reason=f"PO {po.po_number} received",
                reference_type="purchase_order",
                reference_id=po.id,
                unit_cost_at_movement=line.unit_cost,
                movement_cost=abs(delta_qty) * (line.unit_cost or 0),
                performed_by=admin.id,
            ))
            stock.current_stock = new_stock

    # Update PO status based on receipt
    if total_received == 0:
        pass  # keep current status
    elif all_fully_received:
        po.status = "received"
    else:
        po.status = "partial"

    now = datetime.now(timezone.utc)
    # The DB enforces actual_delivery >= expected_delivery when set.
    if po.expected_delivery is None or now >= po.expected_delivery:
        po.actual_delivery = now
    po.updated_at = now

    await db.commit()
    await db.refresh(po)

    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == id)
    )
    po_dict = {c: getattr(po, c) for c in po.__table__.columns.keys()}
    po_dict["lines"] = [
        PurchaseOrderLineOut.model_validate(l) for l in lines_result.scalars().all()
    ]

    return APIResponse(data=PurchaseOrderDetailOut.model_validate(po_dict))


@router.delete("/purchase-orders/{id}", response_model=APIResponse[dict])
async def delete_purchase_order(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
):
    """Cancel/delete a purchase order."""
    po = await _get_po_or_404(db, id)

    if po.status == "received":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a fully received purchase order",
        )

    po.status = "cancelled"
    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return APIResponse(data={"id": po.id, "deleted": True})
