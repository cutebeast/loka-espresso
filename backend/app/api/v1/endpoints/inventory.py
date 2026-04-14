from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from decimal import Decimal

from app.core.database import get_db
from app.core.security import get_current_user, require_role, require_store_access
from app.core.audit import log_action
from app.models.user import User, UserRole
from app.models.menu import InventoryItem, InventoryMovement, MovementType
from app.schemas.menu import (
    InventoryItemOut, InventoryItemCreate, InventoryItemUpdate,
    InventoryAdjustRequest, InventoryMovementOut,
)

router = APIRouter(tags=["Inventory"])

# Roles that can do full CRUD on inventory
HQ_ROLES = {UserRole.admin, UserRole.hq_personnel, UserRole.store_owner}

# Roles that can adjust inventory qty
ADJUST_ROLES = {"manager", "assistant_manager"}


def _is_hq(user: User) -> bool:
    return user.role in HQ_ROLES


# ---------------------------------------------------------------------------
# LIST — everyone with store access can view
# ---------------------------------------------------------------------------
@router.get("/stores/{store_id}/inventory", response_model=list[InventoryItemOut])
async def list_inventory(
    store_id: int,
    category: str | None = None,
    user: User = Depends(require_store_access("store_id", allowed_staff_roles=ADJUST_ROLES | {"manager", "assistant_manager", "barista", "cashier", "delivery"})),
    db: AsyncSession = Depends(get_db),
):
    q = select(InventoryItem).where(InventoryItem.store_id == store_id)
    if category:
        q = q.where(InventoryItem.category == category)
    q = q.order_by(InventoryItem.name)
    result = await db.execute(q)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# CREATE — HQ only
# ---------------------------------------------------------------------------
@router.post("/stores/{store_id}/inventory", response_model=InventoryItemOut, status_code=201)
async def create_inventory(
    store_id: int,
    req: InventoryItemCreate,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    if not _is_hq(user):
        raise HTTPException(403, "Only Admin, HQ Personnel, or Store Owner can create inventory items")
    # Check duplicate name in store
    existing = await db.execute(
        select(InventoryItem).where(InventoryItem.store_id == store_id, InventoryItem.name == req.name, InventoryItem.is_active == True)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"'{req.name}' already exists in this store")
    item = InventoryItem(store_id=store_id, **req.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    await log_action(db, action="INVENTORY_CREATED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item.id, details={"name": item.name})
    await db.commit()
    return item


# ---------------------------------------------------------------------------
# UPDATE — HQ only
# ---------------------------------------------------------------------------
@router.put("/stores/{store_id}/inventory/{item_id}", response_model=InventoryItemOut)
async def update_inventory(
    store_id: int, item_id: int,
    req: InventoryItemUpdate,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    if not _is_hq(user):
        raise HTTPException(403, "Only Admin, HQ Personnel, or Store Owner can edit inventory items")
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    await db.refresh(item)
    await log_action(db, action="INVENTORY_UPDATED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item.id, details={"name": item.name})
    await db.commit()
    return item


# ---------------------------------------------------------------------------
# TOGGLE ACTIVE — HQ only
# ---------------------------------------------------------------------------
@router.patch("/stores/{store_id}/inventory/{item_id}/toggle")
async def toggle_inventory(
    store_id: int, item_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    if not _is_hq(user):
        raise HTTPException(403, "Only Admin, HQ Personnel, or Store Owner can activate/deactivate inventory")
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    item.is_active = not item.is_active
    await db.flush()
    await log_action(db, action="INVENTORY_TOGGLED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item.id, details={"name": item.name, "is_active": item.is_active})
    await db.commit()
    return {"id": item.id, "is_active": item.is_active}


# ---------------------------------------------------------------------------
# DELETE — HQ only
# ---------------------------------------------------------------------------
@router.delete("/stores/{store_id}/inventory/{item_id}")
async def delete_inventory(
    store_id: int, item_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    if not _is_hq(user):
        raise HTTPException(403, "Only Admin, HQ Personnel, or Store Owner can delete inventory")
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    await db.delete(item)
    await db.flush()
    await log_action(db, action="INVENTORY_DELETED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item_id, details={"name": item.name})
    await db.commit()
    return {"detail": "Deleted"}


# ---------------------------------------------------------------------------
# ADJUST QTY — manager/assistant_manager also allowed
# ---------------------------------------------------------------------------
@router.post("/stores/{store_id}/inventory/{item_id}/adjust", response_model=InventoryMovementOut)
async def adjust_inventory(
    store_id: int, item_id: int,
    req: InventoryAdjustRequest,
    user: User = Depends(require_store_access("store_id", allowed_staff_roles=ADJUST_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    if not item.is_active:
        raise HTTPException(400, "Cannot adjust inactive inventory item")

    qty = Decimal(str(req.quantity))
    if qty <= 0:
        raise HTTPException(400, "Quantity must be positive")

    # Determine direction: additions or deductions
    deductions = {"waste", "transfer_out"}
    if req.movement_type in deductions:
        new_balance = item.current_stock - qty
        if new_balance < 0:
            raise HTTPException(400, f"Insufficient inventory. Current: {item.current_stock}, trying to deduct: {qty}")
    else:
        new_balance = item.current_stock + qty

    # Update item balance
    item.current_stock = new_balance
    await db.flush()

    # Create movement record
    movement = InventoryMovement(
        store_id=store_id,
        inventory_item_id=item_id,
        movement_type=MovementType(req.movement_type),
        quantity=qty,
        balance_after=new_balance,
        note=req.note,
        attachment_path=req.attachment_path,
        created_by=user.id,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement)
    await log_action(db, action="INVENTORY_ADJUSTED", user_id=user.id, store_id=store_id, entity_type="inventory", entity_id=item.id,
                     details={"name": item.name, "type": req.movement_type, "qty": str(qty), "balance": str(new_balance)})
    await db.commit()

    return InventoryMovementOut(
        id=movement.id, store_id=store_id, inventory_item_id=item_id,
        inventory_item_name=item.name, movement_type=movement.movement_type.value,
        quantity=float(movement.quantity), balance_after=float(movement.balance_after),
        note=movement.note, attachment_path=movement.attachment_path,
        created_by=user.id, created_by_name=user.name,
        created_at=movement.created_at.isoformat() if movement.created_at else None,
    )


# ---------------------------------------------------------------------------
# LEDGER — per item
# ---------------------------------------------------------------------------
@router.get("/stores/{store_id}/inventory/{item_id}/ledger", response_model=list[InventoryMovementOut])
async def item_ledger(
    store_id: int, item_id: int,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(require_store_access("store_id", allowed_staff_roles=ADJUST_ROLES | {"barista", "cashier", "delivery"})),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InventoryMovement)
        .where(InventoryMovement.store_id == store_id, InventoryMovement.inventory_item_id == item_id)
        .order_by(desc(InventoryMovement.created_at))
        .limit(limit)
    )
    movements = result.scalars().all()
    out = []
    for m in movements:
        user_result = await db.execute(select(User).where(User.id == m.created_by))
        u = user_result.scalar_one_or_none()
        item_result = await db.execute(select(InventoryItem).where(InventoryItem.id == m.inventory_item_id))
        inv = item_result.scalar_one_or_none()
        out.append(InventoryMovementOut(
            id=m.id, store_id=store_id, inventory_item_id=m.inventory_item_id,
            inventory_item_name=inv.name if inv else None,
            movement_type=m.movement_type.value,
            quantity=float(m.quantity), balance_after=float(m.balance_after),
            note=m.note, attachment_path=m.attachment_path,
            created_by=m.created_by, created_by_name=u.name if u else None,
            created_at=m.created_at.isoformat() if m.created_at else None,
        ))
    return out


# ---------------------------------------------------------------------------
# LEDGER — all items in store (for the separate ledger page)
# ---------------------------------------------------------------------------
@router.get("/stores/{store_id}/inventory-ledger", response_model=list[InventoryMovementOut])
async def store_ledger(
    store_id: int,
    limit: int = Query(200, ge=1, le=500),
    movement_type: str | None = None,
    user: User = Depends(require_store_access("store_id", allowed_staff_roles=ADJUST_ROLES | {"barista", "cashier", "delivery"})),
    db: AsyncSession = Depends(get_db),
):
    q = select(InventoryMovement).where(InventoryMovement.store_id == store_id)
    if movement_type:
        q = q.where(InventoryMovement.movement_type == MovementType(movement_type))
    q = q.order_by(desc(InventoryMovement.created_at)).limit(limit)
    result = await db.execute(q)
    movements = result.scalars().all()
    out = []
    for m in movements:
        user_result = await db.execute(select(User).where(User.id == m.created_by))
        u = user_result.scalar_one_or_none()
        item_result = await db.execute(select(InventoryItem).where(InventoryItem.id == m.inventory_item_id))
        inv = item_result.scalar_one_or_none()
        out.append(InventoryMovementOut(
            id=m.id, store_id=store_id, inventory_item_id=m.inventory_item_id,
            inventory_item_name=inv.name if inv else None,
            movement_type=m.movement_type.value,
            quantity=float(m.quantity), balance_after=float(m.balance_after),
            note=m.note, attachment_path=m.attachment_path,
            created_by=m.created_by, created_by_name=u.name if u else None,
            created_at=m.created_at.isoformat() if m.created_at else None,
        ))
    return out


# ---------------------------------------------------------------------------
# LOW STOCK
# ---------------------------------------------------------------------------
@router.get("/stores/{store_id}/inventory/low-stock", response_model=list[InventoryItemOut])
async def low_stock(
    store_id: int,
    user: User = Depends(require_store_access("store_id", allowed_staff_roles=ADJUST_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.store_id == store_id,
            InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.reorder_level,
        )
    )
    return result.scalars().all()
