from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import require_role, require_hq_access
from app.core.audit import log_action, get_client_ip
from app.models.user import User, RoleIDs
from app.models.store import Store
from app.schemas.store import StoreCreate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stores")
async def list_all_stores(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint: list ALL stores including inactive with pagination."""
    total_result = await db.execute(select(func.count()).select_from(Store))
    total = total_result.scalar() or 0
    total_pages = (total + page_size - 1) // page_size

    result = await db.execute(
        select(Store).order_by(Store.id).offset((page - 1) * page_size).limit(page_size)
    )
    stores = result.scalars().all()
    return {
        "stores": [
            {
                "id": s.id, "name": s.name, "slug": s.slug, "address": s.address,
                "phone": s.phone, "opening_hours": s.opening_hours,
                "pickup_lead_minutes": s.pickup_lead_minutes, "is_active": s.is_active,
                "pos_integration_enabled": s.pos_integration_enabled,
                "delivery_integration_enabled": s.delivery_integration_enabled,
            }
            for s in stores
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/stores", status_code=201)
async def create_store(
    request: Request,
    req: StoreCreate,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    store = Store(**req.model_dump())
    db.add(store)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_STORE", user_id=user.id, entity_type="store", entity_id=store.id, details={"name": store.name, "slug": store.slug}, ip_address=ip)
    return {"id": store.id, "name": store.name, "slug": store.slug}


@router.put("/stores/{store_id}")
async def admin_update_store(
    store_id: int,
    request: Request,
    req: dict,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Admin-level store update (bypasses store_access check)."""
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Store not found")
    changes = {}
    for k, v in req.items():
        if hasattr(store, k) and k != "id":
            setattr(store, k, v)
            changes[k] = v
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_STORE", user_id=user.id, store_id=store_id, entity_type="store", entity_id=store_id, details={"changes": changes}, ip_address=ip)
    return {"id": store.id, "name": store.name, "slug": store.slug}


@router.delete("/stores/{store_id}")
async def delete_store(
    store_id: int,
    request: Request,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a store (sets is_active=false)."""
    if store_id == 0:
        raise HTTPException(status_code=400, detail="HQ store cannot be deactivated")
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Store not found")
    store.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_STORE", user_id=user.id, entity_type="store", entity_id=store_id, details={"name": store.name}, ip_address=ip)
    return {"message": "Store deactivated", "id": store_id}


@router.patch("/stores/{store_id}/toggle")
async def toggle_store(
    store_id: int,
    request: Request,
    user: User = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Toggle store active/inactive status."""
    if store_id == 0:
        raise HTTPException(status_code=400, detail="HQ store cannot be deactivated")
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Store not found")
    store.is_active = not store.is_active
    ip = get_client_ip(request)
    await log_action(db, action="TOGGLE_STORE", user_id=user.id, entity_type="store", entity_id=store_id, details={"name": store.name, "is_active": store.is_active}, ip_address=ip)
    return {"id": store.id, "is_active": store.is_active}
