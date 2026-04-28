from datetime import timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.menu import MenuCategory, MenuItem
from app.schemas.menu import CategoryCreate, MenuItemCreate, MenuItemUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/categories", status_code=201)
async def create_category(
    request: Request,
    req: CategoryCreate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    slug = req.slug or req.name.lower().replace(" ", "-")
    existing = await db.execute(
        select(MenuCategory).where(
            MenuCategory.name == req.name,
            MenuCategory.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Category '{req.name}' already exists")
    cat = MenuCategory(name=req.name, slug=slug, display_order=req.display_order)
    db.add(cat)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_CATEGORY", user_id=user.id, entity_type="menu_category", entity_id=cat.id, details={"name": cat.name}, ip_address=ip)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


@router.put("/categories/{cat_id}")
async def update_category(
    cat_id: int,
    request: Request,
    req: CategoryCreate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuCategory).where(MenuCategory.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    existing = await db.execute(
        select(MenuCategory).where(
            MenuCategory.name == req.name,
            MenuCategory.id != cat_id,
            MenuCategory.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Category '{req.name}' already exists")
    cat.name = req.name
    if req.slug:
        cat.slug = req.slug
    cat.display_order = req.display_order
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CATEGORY", user_id=user.id, entity_type="menu_category", entity_id=cat_id, details={"name": cat.name}, ip_address=ip)
    return {"id": cat.id, "name": cat.name}


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: int,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuCategory).where(MenuCategory.id == cat_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_CATEGORY", user_id=user.id, entity_type="menu_category", entity_id=cat_id, details={"name": cat.name}, ip_address=ip)
    return {"message": "Category deleted", "id": cat_id}


@router.post("/items", status_code=201)
async def create_item(
    request: Request,
    req: MenuItemCreate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    item = MenuItem(**req.model_dump())
    db.add(item)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_MENU_ITEM", user_id=user.id, entity_type="menu_item", entity_id=item.id, details={"name": item.name, "price": to_float(item.base_price)}, ip_address=ip)
    return {"id": item.id, "name": item.name, "base_price": to_float(item.base_price)}


@router.put("/items/{item_id}")
async def update_item(
    item_id: int,
    request: Request,
    req: MenuItemUpdate,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    changes = {}
    for k, v in req.model_dump(exclude_none=True).items():
        if hasattr(item, k):
            setattr(item, k, v)
            changes[k] = v
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_MENU_ITEM", user_id=user.id, entity_type="menu_item", entity_id=item_id, details={"changes": changes}, ip_address=ip)
    return {"message": "Item updated"}


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: int,
    request: Request,
    user: AdminUser = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_MENU_ITEM", user_id=user.id, entity_type="menu_item", entity_id=item_id, details={"name": item.name}, ip_address=ip)
    item.deleted_at = datetime.now(timezone.utc)
    item.is_available = False
    return {"message": "Item soft-deleted"}
