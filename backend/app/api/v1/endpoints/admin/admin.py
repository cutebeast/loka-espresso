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

router = APIRouter(prefix="/admin", tags=["Admin"])


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
    
    # Query 1: Filtered orders for KPI metrics (date range + store)
    filtered_q = select(Order).where(Order.status != OrderStatus.cancelled)
    if store_id:
        filtered_q = filtered_q.where(Order.store_id == store_id)
    if from_date:
        filtered_q = filtered_q.where(Order.created_at >= from_date)
    if to_date:
        filtered_q = filtered_q.where(Order.created_at <= to_date)
    
    result = await db.execute(filtered_q)
    filtered_orders = result.scalars().all()
    
    # Separate completed vs in-progress from filtered orders
    filtered_completed = [o for o in filtered_orders if o.status == OrderStatus.completed]
    active_orders = [o for o in filtered_orders if o.status != OrderStatus.completed]

    total_orders = len(filtered_completed)
    total_revenue = sum(to_float(o.total) for o in filtered_completed)
    active_count = len(active_orders)
    customer_count_result = await db.execute(
        select(func.count(User.id)).where(User.role_id == RoleIDs.CUSTOMER)
    )
    total_customers = customer_count_result.scalar() or 0

    # When a date filter is applied, show data for the ENTIRE filtered period
    # When no filter, show today's data as default
    if from_date and to_date:
        orders_today = total_orders
        revenue_today = total_revenue
    else:
        today = now.date()
        today_completed = [o for o in filtered_completed if o.created_at and o.created_at.date() == today]
        orders_today = len(today_completed)
        revenue_today = sum(to_float(o.total) for o in today_completed)

    orders_by_type = {}
    for o in filtered_completed:
        ot = o.order_type.value if hasattr(o.order_type, 'value') else str(o.order_type)
        orders_by_type[ot] = orders_by_type.get(ot, 0) + 1

    # Query 2: Chart data based on chart_mode
    # Determine the date range for chart data based on mode
    chart_from_date = None
    if chart_mode == "day":
        # For day mode (TODAY): fetch last 7 days including today
        chart_from_date = now - timedelta(days=6)
        chart_from_date = chart_from_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif chart_mode == "month":
        # For month mode (MTD): fetch last 6 months
        chart_from_date = now - timedelta(days=180)
    elif chart_mode == "quarter":
        # For quarter mode (QTD): fetch current year
        chart_from_date = datetime(now.year, 1, 1)
    elif chart_mode == "year":
        # For year mode (YTD): fetch last 6 years
        chart_from_date = datetime(now.year - 5, 1, 1)
    
    # Fetch chart data
    chart_q = select(Order).where(Order.status == OrderStatus.completed)
    if store_id:
        chart_q = chart_q.where(Order.store_id == store_id)
    if chart_from_date:
        chart_q = chart_q.where(Order.created_at >= chart_from_date)
    
    result = await db.execute(chart_q)
    chart_orders = result.scalars().all()
    
    # Process chart data based on mode
    chart_data = {}
    if chart_mode == "day":
        # Daily data for last 7 days
        for o in chart_orders:
            if o.created_at:
                day_key = o.created_at.strftime("%Y-%m-%d")
                if day_key not in chart_data:
                    chart_data[day_key] = {"orders": 0, "revenue": 0.0}
                chart_data[day_key]["orders"] += 1
                chart_data[day_key]["revenue"] += to_float(o.total)
    else:
        # Monthly data for month/quarter/year modes
        for o in chart_orders:
            if o.created_at:
                month_key = o.created_at.strftime("%Y-%m")
                if month_key not in chart_data:
                    chart_data[month_key] = {"orders": 0, "revenue": 0.0}
                chart_data[month_key]["orders"] += 1
                chart_data[month_key]["revenue"] += to_float(o.total)

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
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            }
            for o in orders
        ],
    }


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
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    slug = store.slug if store else str(store_id)
    table.qr_code_url = f"https://app.loyaltysystem.uk?store={slug}&table={table.id}"
    ip = get_client_ip(request)
    await log_action(db, action="CREATE_TABLE", user_id=user.id, store_id=store_id, entity_type="store_table", entity_id=table.id, details={"table_number": table.table_number}, ip_address=ip)
    return {"id": table.id, "table_number": table.table_number, "qr_code_url": table.qr_code_url}


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
