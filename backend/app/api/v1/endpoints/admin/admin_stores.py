from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, asc, case

from app.core.database import get_db
from app.core.security import require_role, require_hq_access, require_store_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs
from app.models.store import Store, StoreTable
from app.schemas.store import StoreCreate, StoreUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stores")
async def list_all_stores(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: AdminUser = Depends(require_hq_access()),
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
        "items": [
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
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
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
    req: StoreUpdate,
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Admin-level store update (bypasses store_access check)."""
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Store not found")
    changes = {}
    for k, v in req.model_dump(exclude_none=True).items():
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
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
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
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
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


@router.get("/stores/{store_id}/tables")
async def get_store_tables(
    store_id: int,
    user: AdminUser = Depends(require_store_access()),
    db: AsyncSession = Depends(get_db),
):
    """List tables sorted by is_active DESC, table_number ASC.
    Includes active_order info for dine-in orders that are not completed/cancelled."""
    from app.models.order import Order, OrderStatus

    result = await db.execute(
        select(StoreTable)
        .where(StoreTable.store_id == store_id)
        .order_by(
            case((StoreTable.is_active == True, 0), else_=1),
            StoreTable.table_number.asc(),
        )
    )
    tables = result.scalars().all()

    active_orders_result = await db.execute(
        select(Order).where(
            Order.store_id == store_id,
            Order.table_id.isnot(None),
            Order.status.notin_([
                OrderStatus.completed,
                OrderStatus.cancelled,
            ]),
        )
    )
    active_orders = active_orders_result.scalars().all()

    order_by_table: dict[int, dict] = {}
    for o in active_orders:
        if o.table_id:
            order_by_table[o.table_id] = {
                "id": o.id,
                "order_number": o.order_number,
                "status": o.status.value if hasattr(o.status, 'value') else str(o.status),
                "order_type": o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type),
                "total": to_float(o.total),
                "payment_status": o.payment_status,
            }

    return [
        {
            "id": t.id,
            "store_id": t.store_id,
            "table_number": t.table_number,
            "qr_code_url": t.qr_code_url,
            "qr_generated_at": t.qr_generated_at,
            "capacity": t.capacity,
            "is_active": t.is_active,
            "is_occupied": t.is_occupied,
            "active_order": order_by_table.get(t.id),
        }
        for t in tables
    ]