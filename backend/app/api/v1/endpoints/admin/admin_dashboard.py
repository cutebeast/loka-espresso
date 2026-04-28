from datetime import timezone, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, desc, or_

from app.core.database import get_db
from app.core.security import require_hq_access
from app.core.audit import log_action
from app.core.utils import to_float
from app.models.admin_user import AdminUser
from app.models.customer import Customer
from app.models.order import Order, OrderStatus, OrderType
from app.schemas.admin_extras import DeliveryTrackingUpdate

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/dashboard")
async def dashboard(
    store_id: int = Query(None),
    from_date: datetime = Query(None),
    to_date: datetime = Query(None),
    chart_mode: str = Query(None, description="Chart data mode: day, month, quarter, year"),
    user: AdminUser = Depends(require_hq_access()),
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
        select(func.count(Customer.id))
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
        quarter_start_month = ((now.month - 1) // 3) * 3 + 1
        chart_from_date = datetime(now.year, quarter_start_month, 1)
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
    user: AdminUser = Depends(require_hq_access()),
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

    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    query = query.order_by(desc(Order.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    orders = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "items": [
            {
                "id": o.id,
                "user_id": o.user_id,
                "customer_id": o.customer_id,
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
    req: DeliveryTrackingUpdate,
    user: AdminUser = Depends(require_hq_access()),
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
        val = getattr(req, field, None)
        if val is not None:
            setattr(order, field, int(val) if field == "delivery_eta_minutes" else val)
            updated.append(field)

    if req.delivery_status:
        order.delivery_status = req.delivery_status
        updated.append("delivery_status")

    order.delivery_last_event_at = datetime.now(timezone.utc)

    await log_action(
        db, action="DELIVERY_TRACKING_UPDATE", user_id=user.id,
        store_id=order.store_id, entity_type="order", entity_id=order.id,
        details={"order_number": order.order_number, "updated_fields": updated},
    )
    await db.flush()
    return {"message": "Delivery tracking updated", "updated_fields": updated}
