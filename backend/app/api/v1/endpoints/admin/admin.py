"""
Admin endpoints for the FNB Super App
"""

from datetime import timezone, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, desc, or_

from app.core.database import get_db
from app.core.security import require_role, require_store_access, require_hq_access
from app.core.audit import log_action, get_client_ip
from app.core.utils import to_float
from app.models.user import User, RoleIDs
from app.models.order import Order, OrderStatus, OrderType
from app.models.menu import MenuCategory, MenuItem
from app.models.store import Store, StoreTable
from app.models.marketing import CustomizationOption, TableOccupancySnapshot
from app.schemas.store import StoreCreate, TableCreate, TableUpdate
from app.schemas.menu import CategoryCreate, MenuItemCreate
import secrets
import io
import qrcode
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/admin", tags=["Admin"])


def _generate_qr_token() -> str:
    """Generate a cryptographically secure token for QR code validation."""
    return secrets.token_urlsafe(32)


def _generate_qr_image_url(slug: str, table_id: int, token: str) -> str:
    """Build the QR target URL with store slug, table ID, and security token."""
    return f"https://app.loyaltysystem.uk?store={slug}&table={table_id}&t={token}"


def _make_qr_png(data: str, size: int = 10) -> io.BytesIO:
    """Generate a QR code PNG image in memory."""
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=size, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#2D3B2D", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.get("/dashboard")
async def dashboard(
    store_id: int = Query(None),
    from_date: datetime = Query(None),
    to_date: datetime = Query(None),
    chart_mode: str = Query(None, description="Chart data mode: day, month, quarter, year"),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard with optional store and date filtering.
    
    - total_orders: completed orders only (filtered by date)
    - active_orders: orders currently in progress (not filtered by date)
    - total_revenue: completed orders revenue (filtered by date)
    - monthly: chart data based on chart_mode (fetches appropriate historical data)
    """
    
    now = datetime.now()

    base_filters = [Order.status != OrderStatus.cancelled]
    if store_id:
        base_filters.append(Order.store_id == store_id)
    if from_date:
        base_filters.append(Order.created_at >= from_date)
    if to_date:
        base_filters.append(Order.created_at <= to_date)

    kpi_result = await db.execute(
        select(
            func.count(case((Order.status == OrderStatus.completed, Order.id))).label("total_orders"),
            func.coalesce(func.sum(case((Order.status == OrderStatus.completed, Order.total))), 0).label("total_revenue"),
            func.count(case((Order.status != OrderStatus.completed, Order.id))).label("active_count"),
        ).where(*base_filters)
    )
    kpi_row = kpi_result.fetchone()
    total_orders = kpi_row.total_orders
    total_revenue = float(kpi_row.total_revenue)
    active_count = kpi_row.active_count

    customer_count_result = await db.execute(
        select(func.count(User.id)).where(User.role_id == RoleIDs.CUSTOMER)
    )
    total_customers = customer_count_result.scalar() or 0

    if from_date and to_date:
        orders_today = total_orders
        revenue_today = total_revenue
    else:
        today = now.date()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        today_filters = [
            Order.status == OrderStatus.completed,
            Order.created_at >= today_start,
            Order.created_at <= today_end,
        ]
        if store_id:
            today_filters.append(Order.store_id == store_id)
        today_result = await db.execute(
            select(
                func.count(Order.id).label("orders_today"),
                func.coalesce(func.sum(Order.total), 0).label("revenue_today"),
            ).where(*today_filters)
        )
        today_row = today_result.fetchone()
        orders_today = today_row.orders_today
        revenue_today = float(today_row.revenue_today)

    type_filters = [Order.status == OrderStatus.completed]
    if store_id:
        type_filters.append(Order.store_id == store_id)
    if from_date:
        type_filters.append(Order.created_at >= from_date)
    if to_date:
        type_filters.append(Order.created_at <= to_date)
    type_result = await db.execute(
        select(Order.order_type, func.count(Order.id).label("cnt"))
        .where(*type_filters)
        .group_by(Order.order_type)
    )
    orders_by_type = {}
    for row in type_result.all():
        ot = row.order_type.value if hasattr(row.order_type, 'value') else str(row.order_type)
        orders_by_type[ot] = row.cnt

    chart_from_date = None
    if chart_mode == "day":
        chart_from_date = now - timedelta(days=6)
        chart_from_date = chart_from_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif chart_mode == "month":
        chart_from_date = now - timedelta(days=180)
    elif chart_mode == "quarter":
        chart_from_date = datetime(now.year, 1, 1)
    elif chart_mode == "year":
        chart_from_date = datetime(now.year - 5, 1, 1)

    chart_data = {}
    if chart_mode:
        chart_filters = [Order.status == OrderStatus.completed]
        if store_id:
            chart_filters.append(Order.store_id == store_id)
        if chart_from_date:
            chart_filters.append(Order.created_at >= chart_from_date)

        if chart_mode == "day":
            trunc = func.date_trunc("day", Order.created_at)
        else:
            trunc = func.date_trunc("month", Order.created_at)

        chart_result = await db.execute(
            select(
                trunc.label("period"),
                func.count(Order.id).label("orders"),
                func.coalesce(func.sum(Order.total), 0).label("revenue"),
            )
            .where(*chart_filters)
            .group_by(trunc)
        )
        for row in chart_result.all():
            key = row.period.strftime("%Y-%m-%d") if chart_mode == "day" else row.period.strftime("%Y-%m")
            chart_data[key] = {"orders": row.orders, "revenue": float(row.revenue)}

    return {
        "total_orders": total_orders,
        "active_orders": active_count,
        "total_revenue": round(total_revenue, 2),
        "total_customers": total_customers,
        "orders_today": orders_today,
        "revenue_today": round(revenue_today, 2),
        "orders_by_type": orders_by_type,
        "monthly": chart_data,
        "chart_mode": chart_mode,
    }


@router.get("/orders")
async def list_all_orders(
    store_id: int | None = None,
    status: str | None = None,
    order_type: str | None = None,
    table_id: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """List all orders across all customers (merchant dashboard)."""
    query = select(Order)
    if store_id:
        query = query.where(Order.store_id == store_id)
    if status:
        query = query.where(Order.status == status)
    if order_type:
        query = query.where(Order.order_type == order_type)
    if table_id is not None:
        query = query.where(Order.table_id == table_id)
    if search:
        query = query.where(or_(
            Order.order_number.ilike(f"%{search}%"),
            Order.notes.ilike(f"%{search}%"),
        ))

    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Fetch page
    query = query.order_by(desc(Order.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    orders = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "orders": [
            {
                "id": o.id,
                "user_id": o.user_id,
                "store_id": o.store_id,
                "table_id": o.table_id,
                "order_number": o.order_number,
                "order_type": o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type),
                "items": o.items,
                "subtotal": to_float(o.subtotal),
                "delivery_fee": to_float(o.delivery_fee),
                "discount": to_float(o.discount),
                "total": to_float(o.total),
                "status": o.status.value if hasattr(o.status, 'value') else str(o.status),
                "payment_method": o.payment_method,
                "payment_status": o.payment_status,
                "loyalty_points_earned": o.loyalty_points_earned,
                "notes": o.notes,
                "pickup_time": o.pickup_time.isoformat() if o.pickup_time else None,
                "delivery_address": o.delivery_address,
                "delivery_provider": o.delivery_provider,
                "delivery_status": o.delivery_status,
                "delivery_tracking_url": o.delivery_tracking_url,
                "delivery_courier_name": o.delivery_courier_name,
                "delivery_courier_phone": o.delivery_courier_phone,
                "delivery_eta_minutes": o.delivery_eta_minutes,
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            }
            for o in orders
        ],
    }


@router.patch("/orders/{order_id}/delivery-tracking")
async def update_delivery_tracking(
    order_id: int,
    req: dict,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually update delivery tracking info (Scenario B: no 3PL API).
    Service crew enters driver info after manually booking a courier.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order_type = order.order_type.value if hasattr(order.order_type, 'value') else str(order.order_type)
    if order_type != "delivery":
        raise HTTPException(status_code=400, detail="Only delivery orders have tracking info")

    updated = []
    for field in ("delivery_courier_name", "delivery_courier_phone", "delivery_tracking_url",
                   "delivery_provider", "delivery_eta_minutes", "delivery_external_id"):
        val = req.get(field)
        if val is not None:
            setattr(order, field, int(val) if field == "delivery_eta_minutes" else val)
            updated.append(field)

    if req.get("delivery_status"):
        order.delivery_status = req["delivery_status"]
        updated.append("delivery_status")

    order.delivery_last_event_at = datetime.now(timezone.utc)

    await log_action(
        db, action="DELIVERY_TRACKING_UPDATE", user_id=user.id,
        store_id=order.store_id, entity_type="order", entity_id=order.id,
        details={"order_number": order.order_number, "updated_fields": updated},
    )
    await db.flush()
    return {"message": "Delivery tracking updated", "updated_fields": updated}


# ---------------------------------------------------------------------------
# Store CRUD
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Category CRUD
# ---------------------------------------------------------------------------

@router.post("/stores/{store_id}/categories", status_code=201)
async def create_category(
    store_id: int,
    request: Request,
    req: CategoryCreate,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    slug = req.slug or req.name.lower().replace(" ", "-")
    # Check for duplicate category name in this store
    existing = await db.execute(
        select(MenuCategory).where(
            MenuCategory.store_id == store_id,
            MenuCategory.name == req.name,
            MenuCategory.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Category '{req.name}' already exists in this store")
    cat = MenuCategory(store_id=store_id, name=req.name, slug=slug, display_order=req.display_order)
    db.add(cat)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_CATEGORY", user_id=user.id, store_id=store_id, entity_type="menu_category", entity_id=cat.id, details={"name": cat.name}, ip_address=ip)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


@router.put("/stores/{store_id}/categories/{cat_id}")
async def update_category(
    store_id: int, cat_id: int,
    request: Request,
    req: CategoryCreate,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.store_id == store_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Check for duplicate name (excluding self)
    existing = await db.execute(
        select(MenuCategory).where(
            MenuCategory.store_id == store_id,
            MenuCategory.name == req.name,
            MenuCategory.id != cat_id,
            MenuCategory.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Category '{req.name}' already exists in this store")
    cat.name = req.name
    if req.slug:
        cat.slug = req.slug
    cat.display_order = req.display_order
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CATEGORY", user_id=user.id, store_id=store_id, entity_type="menu_category", entity_id=cat_id, details={"name": cat.name}, ip_address=ip)
    return {"id": cat.id, "name": cat.name}


@router.delete("/stores/{store_id}/categories/{cat_id}")
async def delete_category(
    store_id: int, cat_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuCategory).where(MenuCategory.id == cat_id, MenuCategory.store_id == store_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_CATEGORY", user_id=user.id, store_id=store_id, entity_type="menu_category", entity_id=cat_id, details={"name": cat.name}, ip_address=ip)
    return {"deleted": True, "id": cat_id}


# ---------------------------------------------------------------------------
# Menu Item CRUD
# ---------------------------------------------------------------------------

@router.post("/stores/{store_id}/items", status_code=201)
async def create_item(
    store_id: int,
    request: Request,
    req: MenuItemCreate,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    item = MenuItem(store_id=store_id, **req.model_dump())
    db.add(item)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_MENU_ITEM", user_id=user.id, store_id=store_id, entity_type="menu_item", entity_id=item.id, details={"name": item.name, "price": to_float(item.base_price)}, ip_address=ip)
    return {"id": item.id, "name": item.name, "base_price": to_float(item.base_price)}


@router.put("/stores/{store_id}/items/{item_id}")
async def update_item(
    store_id: int, item_id: int,
    request: Request,
    req: dict,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    changes = {k: v for k, v in req.items() if hasattr(item, k)}
    for k, v in req.items():
        if hasattr(item, k):
            setattr(item, k, v)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_MENU_ITEM", user_id=user.id, store_id=store_id, entity_type="menu_item", entity_id=item_id, details={"changes": changes}, ip_address=ip)
    return {"message": "Item updated"}


@router.delete("/stores/{store_id}/items/{item_id}")
async def delete_item(
    store_id: int, item_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.store_id == store_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_MENU_ITEM", user_id=user.id, store_id=store_id, entity_type="menu_item", entity_id=item_id, details={"name": item.name}, ip_address=ip)
    item.deleted_at = datetime.now(timezone.utc)
    item.is_available = False
    return {"message": "Item soft-deleted"}


# ---------------------------------------------------------------------------
# Table CRUD
# ---------------------------------------------------------------------------

@router.post("/stores/{store_id}/tables", status_code=201)
async def create_table(
    store_id: int,
    request: Request,
    req: TableCreate,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicate table number in this store
    existing = await db.execute(
        select(StoreTable).where(
            StoreTable.store_id == store_id,
            StoreTable.table_number == req.table_number,
            StoreTable.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Table '{req.table_number}' already exists in this store")
    table = StoreTable(store_id=store_id, table_number=req.table_number, capacity=req.capacity)
    db.add(table)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table.id, details={"table_number": table.table_number}, ip_address=ip)
    return {
        "id": table.id,
        "table_number": table.table_number,
        "capacity": table.capacity,
        "qr_code_url": None,
        "qr_generated_at": None,
        "message": "Table created. Generate QR code to activate for dine-in.",
    }


@router.put("/stores/{store_id}/tables/{table_id}")
async def update_table(
    store_id: int, table_id: int,
    request: Request,
    req: TableUpdate,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")
    if req.table_number is not None:
        # Check for duplicate table number
        existing = await db.execute(
            select(StoreTable).where(
                StoreTable.store_id == store_id,
                StoreTable.table_number == req.table_number,
                StoreTable.id != table_id,
                StoreTable.is_active == True,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Table '{req.table_number}' already exists in this store")
        table.table_number = req.table_number
    if req.capacity is not None:
        table.capacity = req.capacity
    if req.is_active is not None:
        table.is_active = req.is_active
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, ip_address=ip)
    return {"id": table.id, "table_number": table.table_number, "capacity": table.capacity, "is_active": table.is_active}


@router.delete("/stores/{store_id}/tables/{table_id}")
async def delete_table(
    store_id: int, table_id: int,
    request: Request,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")
    table.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, details={"table_number": table.table_number}, ip_address=ip)
    return {"deleted": True, "id": table_id}


@router.get("/stores/{store_id}/tables/{table_id}/qr-image")
async def get_table_qr_image(
    store_id: int, table_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Serve the QR code as a PNG image for display/download."""
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table or not table.qr_code_url:
        raise HTTPException(404, "Table or QR code not found")
    buf = _make_qr_png(table.qr_code_url)
    return StreamingResponse(buf, media_type="image/png", headers={
        "Content-Disposition": f'inline; filename="table-{table.table_number}-qr.png"',
    })


@router.post("/stores/{store_id}/tables/{table_id}/generate-qr")
async def generate_table_qr(
    store_id: int, table_id: int,
    request: Request,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate QR code with a new security token. Old QR codes become invalid."""
    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(404, "Table not found")

    store_result = await db.execute(select(Store).where(Store.id == store_id))
    store = store_result.scalar_one_or_none()
    slug = store.slug if store else str(store_id)

    # Generate new token — invalidates all previous QR codes
    new_token = _generate_qr_token()
    table.qr_token = new_token
    table.qr_code_url = _generate_qr_image_url(slug, table.id, new_token)
    table.qr_generated_at = datetime.now(timezone.utc)

    ip = get_client_ip(request)
    await log_action(db, action="GENERATE_QR", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table_id, details={"table_number": table.table_number}, ip_address=ip)

    return {
        "id": table.id,
        "table_number": table.table_number,
        "qr_code_url": table.qr_code_url,
        "qr_generated_at": table.qr_generated_at,
        "message": "QR code generated. Print and place on the table.",
    }


# ---------------------------------------------------------------------------
# Customization Options CRUD
# ---------------------------------------------------------------------------

@router.get("/stores/{store_id}/items/{item_id}/customizations")
async def list_customization_options(
    store_id: int, item_id: int,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """List customization options for a menu item."""
    result = await db.execute(
        select(CustomizationOption).where(
            CustomizationOption.menu_item_id == item_id,
            CustomizationOption.is_active == True,
        ).order_by(CustomizationOption.display_order)
    )
    return result.scalars().all()


@router.post("/stores/{store_id}/items/{item_id}/customizations", status_code=201)
async def create_customization_option(
    store_id: int, item_id: int,
    request: Request,
    req: dict,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Add a customization option to a menu item."""
    result = await db.execute(select(MenuItem).where(MenuItem.id == item_id, MenuItem.store_id == store_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Menu item not found")
    opt = CustomizationOption(
        menu_item_id=item_id,
        name=req.get("name"),
        price_adjustment=req.get("price_adjustment", 0),
        display_order=req.get("display_order", 0),
    )
    db.add(opt)
    await db.flush()
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_CUSTOMIZATION", user_id=user.id, store_id=store_id, entity_type="customization_option", entity_id=opt.id, details={"name": opt.name, "item_id": item_id}, ip_address=ip)
    return {"id": opt.id, "name": opt.name, "price_adjustment": to_float(opt.price_adjustment)}


@router.put("/stores/{store_id}/customizations/{option_id}")
async def update_customization_option(
    store_id: int, option_id: int,
    request: Request,
    req: dict,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Update a customization option."""
    result = await db.execute(select(CustomizationOption).where(CustomizationOption.id == option_id))
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Option not found")
    for k, v in req.items():
        if hasattr(opt, k):
            setattr(opt, k, v)
    ip = get_client_ip(request)
    await log_action(db, action="UPDATE_CUSTOMIZATION", user_id=user.id, store_id=store_id, entity_type="customization_option", entity_id=option_id, ip_address=ip)
    return {"message": "Option updated"}


@router.delete("/stores/{store_id}/customizations/{option_id}")
async def delete_customization_option(
    store_id: int, option_id: int,
    request: Request,
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a customization option."""
    result = await db.execute(select(CustomizationOption).where(CustomizationOption.id == option_id))
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Option not found")
    opt.is_active = False
    ip = get_client_ip(request)
    await log_action(db, action="DELETE_CUSTOMIZATION", user_id=user.id, store_id=store_id, entity_type="customization_option", entity_id=option_id, details={"name": opt.name}, ip_address=ip)
    return {"message": "Option deactivated"}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get("/reports/sales")
async def sales_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    total = sum(to_float(o.total) for o in orders)
    return {"data": [{"order_number": o.order_number, "total": to_float(o.total), "type": o.order_type, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders], "total": round(total, 2)}


@router.get("/reports/popular")
async def popular_report(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    store_id: int = Query(None),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date, Order.status != OrderStatus.cancelled)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    item_counts = {}
    for o in orders:
        for item in (o.items or []):
            name = item.get("name", "Unknown")
            item_counts[name] = item_counts.get(name, 0) + item.get("quantity", 1)
    sorted_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    return {"data": [{"item_name": name, "order_count": count} for name, count in sorted_items]}


@router.get("/export")
async def export_data(
    from_date: datetime = Query(...), to_date: datetime = Query(...),
    type: str = Query("orders"), store_id: int = Query(None),
    user: User = Depends(require_hq_access()),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order).where(Order.created_at >= from_date, Order.created_at <= to_date)
    if store_id:
        q = q.where(Order.store_id == store_id)
    result = await db.execute(q)
    orders = result.scalars().all()
    rows = []
    for o in orders:
        rows.append({
            "order_number": o.order_number, "order_type": o.order_type,
            "total": to_float(o.total), "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else "",
        })
    return {"data": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# Manual Table Occupancy Override
# ---------------------------------------------------------------------------

@router.patch("/stores/{store_id}/tables/{table_id}/occupancy")
async def set_table_occupancy(
    store_id: int, table_id: int, req: dict,
    user: User = Depends(require_store_access("store_id")),
    db: AsyncSession = Depends(get_db),
):
    """Manually set table occupancy (override trigger-based status).
    Body: {"is_occupied": true/false}
    """
    is_occupied = req.get("is_occupied")
    if is_occupied is None:
        raise HTTPException(status_code=400, detail="is_occupied is required")

    result = await db.execute(select(StoreTable).where(StoreTable.id == table_id, StoreTable.store_id == store_id))
    table = result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table.is_occupied = is_occupied

    snap_result = await db.execute(
        select(TableOccupancySnapshot).where(TableOccupancySnapshot.table_id == table_id)
    )
    snap = snap_result.scalar_one_or_none()
    if snap:
        snap.is_occupied = is_occupied
        if not is_occupied:
            snap.current_order_id = None
        snap.updated_at = datetime.now(timezone.utc)
    else:
        snap = TableOccupancySnapshot(
            table_id=table_id, store_id=store_id, is_occupied=is_occupied,
        )
        db.add(snap)

    return {"table_id": table_id, "is_occupied": is_occupied}
