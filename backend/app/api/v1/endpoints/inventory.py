from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_role
from app.models.user import User
from app.models.menu import InventoryItem
from app.schemas.menu import InventoryItemOut, InventoryItemCreate, InventoryItemUpdate

router = APIRouter(tags=["Inventory"])


@router.get("/stores/{store_id}/inventory", response_model=list[InventoryItemOut])
async def list_inventory(store_id: int, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.store_id == store_id))
    return result.scalars().all()


@router.post("/stores/{store_id}/inventory", response_model=InventoryItemOut, status_code=201)
async def add_inventory(store_id: int, req: InventoryItemCreate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    item = InventoryItem(store_id=store_id, **req.model_dump())
    db.add(item)
    await db.flush()
    return item


@router.put("/stores/{store_id}/inventory/{item_id}", response_model=InventoryItemOut)
async def update_inventory(store_id: int, item_id: int, req: InventoryItemUpdate, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.flush()
    return item


@router.delete("/stores/{store_id}/inventory/{item_id}")
async def delete_inventory(store_id: int, item_id: int, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    await db.delete(item)
    await db.flush()
    return {"message": "Deleted"}


@router.get("/stores/{store_id}/inventory/low-stock", response_model=list[InventoryItemOut])
async def low_stock(store_id: int, user: User = Depends(require_role("admin", "store_owner")), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventoryItem).where(InventoryItem.store_id == store_id, InventoryItem.current_stock <= InventoryItem.reorder_level))
    return result.scalars().all()
