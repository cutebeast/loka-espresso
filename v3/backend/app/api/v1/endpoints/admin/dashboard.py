"""Admin dashboard endpoints — enhanced with KPI cards, orders by type, monthly data."""

from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select, extract

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.order import Order
from app.models.store import Store
from app.schemas.base import APIResponse, BaseSchema

router = APIRouter(prefix="/admin/dashboard", tags=["admin — dashboard"])


class DashboardMetricsOut(BaseSchema):
    stores: int
    menu_items: int
    inventory_items: int
    staff: int
    customers: int
    orders_today: int
    revenue_today: float
    # Enhanced fields
    total_orders: int
    total_revenue: float
    active_orders: int
    orders_by_type: dict
    monthly_data: list[dict]


@router.get("/metrics", response_model=APIResponse[DashboardMetricsOut])
async def dashboard_metrics(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    # Date range
    dfrom = today_start - timedelta(days=30)
    dto = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=timezone.utc)
    if from_date:
        try: dfrom = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
        except ValueError: pass
    if to_date:
        try: dto = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc)
        except ValueError: pass

    def order_filter(stmt):
        stmt = stmt.where(Order.deleted_at.is_(None))
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    # Counts
    stores = (await db.execute(select(func.count()).select_from(Store).where(Store.deleted_at.is_(None)))).scalar() or 0
    menu_items = 0  # simplified
    inventory_items = 0
    staff = 0
    customers = (await db.execute(select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None), Customer.anonymized_at.is_(None)))).scalar() or 0

    # Today
    orders_today = (await db.execute(order_filter(select(func.count()).select_from(Order).where(Order.created_at >= today_start)))).scalar() or 0
    revenue_today = float((await db.execute(order_filter(select(func.coalesce(func.sum(Order.total_amount), 0.0)).select_from(Order).where(Order.created_at >= today_start)))).scalar() or 0)

    # Total in range
    total_orders = (await db.execute(order_filter(select(func.count()).select_from(Order).where(Order.created_at >= dfrom, Order.created_at <= dto)))).scalar() or 0
    total_revenue = float((await db.execute(order_filter(select(func.coalesce(func.sum(Order.total_amount), 0.0)).select_from(Order).where(Order.created_at >= dfrom, Order.created_at <= dto)))).scalar() or 0)
    active_orders = (await db.execute(order_filter(select(func.count()).select_from(Order).where(Order.status.in_(("pending", "confirmed", "preparing")))))).scalar() or 0

    # Orders by type
    type_result = await db.execute(
        order_filter(
            select(Order.order_type, func.count(), func.sum(Order.total_amount))
            .where(Order.created_at >= dfrom, Order.created_at <= dto)
            .group_by(Order.order_type)
        )
    )
    orders_by_type = {}
    for row in type_result:
        orders_by_type[row[0]] = {"count": row[1], "revenue": float(row[2] or 0)}

    # Monthly data
    monthly_result = await db.execute(
        order_filter(
            select(
                extract("year", Order.created_at).label("y"),
                extract("month", Order.created_at).label("m"),
                func.count(),
                func.sum(Order.total_amount),
            )
            .where(Order.created_at >= dfrom, Order.created_at <= dto)
            .group_by("y", "m")
            .order_by("y", "m")
        )
    )
    monthly_data = [
        {"year": int(r[0]), "month": int(r[1]), "orders": r[2], "revenue": float(r[3] or 0)}
        for r in monthly_result
    ]

    return APIResponse(
        data=DashboardMetricsOut(
            stores=stores, menu_items=menu_items, inventory_items=inventory_items,
            staff=staff, customers=customers,
            orders_today=orders_today, revenue_today=revenue_today,
            total_orders=total_orders, total_revenue=total_revenue,
            active_orders=active_orders,
            orders_by_type=orders_by_type, monthly_data=monthly_data,
        )
    )
