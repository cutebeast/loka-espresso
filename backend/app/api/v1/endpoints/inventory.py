from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_store_access, require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.user import User, RoleIDs
from app.models.menu import InventoryItem, InventoryCategory, InventoryMovement, MovementType
from app.schemas.menu import (
    InventoryItemOut, InventoryItemCreate, InventoryItemUpdate,
    InventoryCategoryOut, InventoryCategoryCreate,
    InventoryAdjustRequest, InventoryMovementOut,
)

router = APIRouter(tags=["Inventory"])

# Store management roles that can adjust inventory
ADJUST_ROLES = {"manager", "assistant_manager"}
# All dashboard roles that can view inventory
VIEW_ROLES = {"manager", "assistant_manager", "barista", "cashier", "delivery"}




async def _item_to_out(item: InventoryItem, db: AsyncSession) -> InventoryItemOut:
    cat_name = None
    if item.category_id:
        cat_result = await db.execute(select(InventoryCategory).where(InventoryCategory.id == item.category_id))
        cat = cat_result.scalar_one_or_none()
        if cat:
            cat_name = cat.name
    return InventoryItemOut(
        id=item.id, store_id=item.store_id, name=item.name,
        current_stock=to_float(item.current_stock), unit=item.unit,
        reorder_level=to_float(item.reorder_level), is_active=item.is_active,
        category_id=item.category_id, category_name=cat_name,
    )


# ---------------------------------------------------------------------------
# INVENTORY CATEGORIES
# ---------------------------------------------------------------------------

@router.get("/stores/{store_id}/inventory-categories", response_model=list[InventoryCategoryOut])
async def list_inventory_categories(
    store_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InventoryCategory)
        .where(InventoryCategory.store_id == store_id)
        .order_by(InventoryCategory.display_order, InventoryCategory.name)
    )
    return result.scalars().all()


@router.post("/stores/{store_id}/inventory-categories", response_model=InventoryCategoryOut, status_code=201)
async def create_inventory_category(
    store_id: int,
    req: InventoryCategoryCreate,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(InventoryCategory).where(InventoryCategory.store_id == store_id, InventoryCategory.name == req.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Category '{req.name}' already exists")
    slug = req.slug or req.name.lower().replace(" ", "-")
    cat = InventoryCategory(store_id=store_id, name=req.name, slug=slug, display_order=req.display_order)
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    await log_action(db, action="CREATE_INVENTORY_CATEGORY", user_id=user.id, store_id=store_id,
                     entity_type="inventory_category", entity_id=cat.id, details={"name": cat.name}, ip_address=get_client_ip(request))
    return cat


@router.put("/stores/{store_id}/inventory-categories/{cat_id}", response_model=InventoryCategoryOut)
async def update_inventory_category(
    store_id: int, cat_id: int,
    req: InventoryCategoryCreate,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryCategory).where(InventoryCategory.id == cat_id, InventoryCategory.store_id == store_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    existing = await db.execute(
        select(InventoryCategory).where(InventoryCategory.store_id == store_id, InventoryCategory.name == req.name, InventoryCategory.id != cat_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Category '{req.name}' already exists")
    cat.name = req.name
    if req.slug:
        cat.slug = req.slug
    cat.display_order = req.display_order
    await log_action(db, action="UPDATE_INVENTORY_CATEGORY", user_id=user.id, store_id=store_id,
                     entity_type="inventory_category", entity_id=cat_id, details={"name": cat.name}, ip_address=get_client_ip(request))
    return cat


@router.delete("/stores/{store_id}/inventory-categories/{cat_id}")
async def delete_inventory_category(
    store_id: int, cat_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryCategory).where(InventoryCategory.id == cat_id, InventoryCategory.store_id == store_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.is_active = False
    await log_action(db, action="DELETE_INVENTORY_CATEGORY", user_id=user.id, store_id=store_id,
                     entity_type="inventory_category", entity_id=cat_id, details={"name": cat.name}, ip_address=get_client_ip(request))
    return {"detail": "Category deactivated"}


# ---------------------------------------------------------------------------
# INVENTORY ITEMS
# ---------------------------------------------------------------------------

@router.get("/stores/{store_id}/inventory", response_model=list[InventoryItemOut])
async def list_inventory(
    store_id: int,
    category_id: int | None = None,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    q = select(InventoryItem).where(InventoryItem.store_id == store_id)
    if category_id:
        q = q.where(InventoryItem.category_id == category_id)
    q = q.order_by(InventoryItem.name)
    result = await db.execute(q)
    items = result.scalars().all()
    out = []
    for item in items:
        out.append(await _item_to_out(item, db))
    return out


@router.post("/stores/{store_id}/inventory", response_model=InventoryItemOut, status_code=201)
async def create_inventory(
    store_id: int,
    req: InventoryItemCreate,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(InventoryItem).where(InventoryItem.store_id == store_id, InventoryItem.name == req.name, InventoryItem.is_active == True)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"'{req.name}' already exists in this store")
    item = InventoryItem(store_id=store_id, **req.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    ip = get_client_ip(request)

    # Always create a ledger entry for inventory creation (opening stock received)
    if item.current_stock and item.current_stock > 0:
        movement = InventoryMovement(
            store_id=store_id, inventory_item_id=item.id,
            movement_type=MovementType("received"),
            quantity=item.current_stock, balance_after=item.current_stock,
            note="Opening stock", created_by=user.id,
        )
        db.add(movement)
        await db.flush()

    await log_action(db, action="INVENTORY_CREATED", user_id=user.id, store_id=store_id,
                     entity_type="inventory", entity_id=item.id, details={"name": item.name}, ip_address=ip)
    return await _item_to_out(item, db)


@router.put("/stores/{store_id}/inventory/{item_id}", response_model=InventoryItemOut)
async def update_inventory(
    store_id: int, item_id: int,
    req: InventoryItemUpdate,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    await db.refresh(item)
    ip = get_client_ip(request)
    await log_action(db, action="INVENTORY_UPDATED", user_id=user.id, store_id=store_id,
                     entity_type="inventory", entity_id=item.id, details={"name": item.name}, ip_address=ip)
    return await _item_to_out(item, db)


@router.patch("/stores/{store_id}/inventory/{item_id}/toggle")
async def toggle_inventory(
    store_id: int, item_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    item.is_active = not item.is_active
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="INVENTORY_TOGGLED", user_id=user.id, store_id=store_id,
                     entity_type="inventory", entity_id=item.id, details={"name": item.name, "is_active": item.is_active}, ip_address=ip)
    return {"id": item.id, "is_active": item.is_active}


@router.delete("/stores/{store_id}/inventory/{item_id}")
async def delete_inventory(
    store_id: int, item_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    await db.delete(item)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="INVENTORY_DELETED", user_id=user.id, store_id=store_id,
                     entity_type="inventory", entity_id=item_id, details={"name": item.name}, ip_address=ip)
    return {"detail": "Deleted"}


# ---------------------------------------------------------------------------
# ADJUST QTY
# ---------------------------------------------------------------------------

@router.post("/stores/{store_id}/inventory/{item_id}/adjust", response_model=InventoryMovementOut)
async def adjust_inventory(
    store_id: int, item_id: int,
    req: InventoryAdjustRequest,
    request: Request,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    # Use SELECT FOR UPDATE to prevent race conditions on concurrent adjustments
    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.id == item_id, InventoryItem.store_id == store_id)
        .with_for_update()
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    if not item.is_active:
        raise HTTPException(400, "Cannot adjust inactive inventory item")

    qty = Decimal(str(req.quantity))
    if qty <= 0:
        raise HTTPException(400, "Quantity must be positive")

    deductions = {"waste", "transfer_out"}
    if req.movement_type in deductions:
        new_balance = item.current_stock - qty
        if new_balance < 0:
            raise HTTPException(400, f"Insufficient inventory. Current: {item.current_stock}, trying to deduct: {qty}")
    else:
        new_balance = item.current_stock + qty

    item.current_stock = new_balance
    # Flush is handled by get_db() auto-commit pattern, but we need it for the lock
    await db.flush()

    movement = InventoryMovement(
        store_id=store_id, inventory_item_id=item_id,
        movement_type=MovementType(req.movement_type),
        quantity=qty, balance_after=new_balance,
        note=req.note, attachment_path=req.attachment_path,
        created_by=user.id,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement)
    await log_action(db, action="INVENTORY_ADJUSTED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item.id,
                     details={"name": item.name, "type": req.movement_type, "qty": str(qty), "balance": str(new_balance)}, ip_address=get_client_ip(request))

    return InventoryMovementOut(
        id=movement.id, store_id=store_id, inventory_item_id=item_id,
        inventory_item_name=item.name, movement_type=movement.movement_type.value,
        quantity=to_float(movement.quantity), balance_after=to_float(movement.balance_after),
        note=movement.note, attachment_path=movement.attachment_path,
        created_by=user.id, created_by_name=user.name,
        created_at=movement.created_at.isoformat() if movement.created_at else None,
    )


# ---------------------------------------------------------------------------
# LEDGER
# ---------------------------------------------------------------------------

async def _build_movement_out(m, store_id, db):
    user_result = await db.execute(select(User).where(User.id == m.created_by))
    u = user_result.scalar_one_or_none()
    item_result = await db.execute(select(InventoryItem).where(InventoryItem.id == m.inventory_item_id))
    inv = item_result.scalar_one_or_none()
    return InventoryMovementOut(
        id=m.id, store_id=store_id, inventory_item_id=m.inventory_item_id,
        inventory_item_name=inv.name if inv else None,
        movement_type=m.movement_type.value,
        quantity=to_float(m.quantity), balance_after=to_float(m.balance_after),
        note=m.note, attachment_path=m.attachment_path,
        created_by=m.created_by, created_by_name=u.name if u else None,
        created_at=m.created_at.isoformat() if m.created_at else None,
    )


@router.get("/stores/{store_id}/inventory/{item_id}/ledger", response_model=list[InventoryMovementOut])
async def item_ledger(
    store_id: int, item_id: int,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InventoryMovement)
        .where(InventoryMovement.store_id == store_id, InventoryMovement.inventory_item_id == item_id)
        .order_by(desc(InventoryMovement.created_at)).limit(limit)
    )
    movements = result.scalars().all()
    out = []
    for m in movements:
        out.append(await _build_movement_out(m, store_id, db))
    return out


@router.get("/stores/{store_id}/inventory-ledger")
async def store_ledger(
    store_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    movement_type: str | None = None,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Get inventory ledger with pagination and date filtering."""
    # Base query
    q = select(InventoryMovement).where(InventoryMovement.store_id == store_id)
    
    # Apply filters
    if movement_type:
        q = q.where(InventoryMovement.movement_type == MovementType(movement_type))
    if from_date:
        q = q.where(InventoryMovement.created_at >= from_date)
    if to_date:
        q = q.where(InventoryMovement.created_at <= to_date)
    
    # Get total count
    count_q = select(func.count()).select_from(q.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0
    
    # Apply pagination
    q = q.order_by(desc(InventoryMovement.created_at))
    q = q.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(q)
    movements = result.scalars().all()
    
    out = []
    for m in movements:
        out.append(await _build_movement_out(m, store_id, db))
    
    total_pages = (total + page_size - 1) // page_size
    
    return {
        "entries": out,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.post("/admin/system/backfill-inventory-ledger", status_code=200)
async def backfill_inventory_ledger(
    request: Request,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Backfill missing ledger entries for all existing inventory items.
    Creates a RECEIVED movement for each item using its current_stock as opening balance.
    Idempotent: only creates entries for items that have no ledger history.
    """
    from sqlalchemy import select, not_, exists
    from sqlalchemy.orm import selectinload

    # Find all inventory items that have no ledger entries
    subq = select(InventoryMovement.inventory_item_id).distinct()
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.is_active == True,
            not_(exists(subq.where(InventoryMovement.inventory_item_id == InventoryItem.id))
                 )
        )
    )
    items = result.scalars().all()
    created = 0
    for item in items:
        if item.current_stock and item.current_stock > 0:
            movement = InventoryMovement(
                store_id=item.store_id,
                inventory_item_id=item.id,
            movement_type=MovementType("received"),
                quantity=item.current_stock,
                balance_after=item.current_stock,
                note="Opening stock (backfill)",
                created_by=user.id,
            )
            db.add(movement)
            created += 1

    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="BACKFILL_INVENTORY_LEDGER", user_id=user.id,
                     details={"items_backfilled": created, "total_items_found": len(items)}, ip_address=ip)
    await db.commit()
    return {"message": "Inventory ledger backfill complete", "created": created, "total_items": len(items)}


@router.get("/stores/{store_id}/inventory/low-stock", response_model=list[InventoryItemOut])
async def low_stock(
    store_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.store_id == store_id,
            InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.reorder_level,
        )
    )
    items = result.scalars().all()
    out = []
    for item in items:
        out.append(await _item_to_out(item, db))
    return out
