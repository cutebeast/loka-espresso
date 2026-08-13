"""Admin dashboard endpoints — enhanced with KPI cards, orders by type, monthly data."""
from decimal import Decimal
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select, extract

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.core.business_time import BUSINESS_TZ, day_end_utc, day_start_utc
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.menu import MenuItem
from app.models.order import Order
from app.models.payment import Payment
from app.models.staff import StaffProfile
from app.models.store import Store
from app.schemas.base import APIResponse, BaseSchema, Money

router = APIRouter(prefix="/admin/dashboard", tags=["admin — dashboard"])


class DashboardMetricsOut(BaseSchema):
    stores: int
    menu_items: int
    inventory_items: int
    staff: int
    customers: int
    orders_today: int
    revenue_today: Money
    # Enhanced fields
    total_orders: int
    total_revenue: Money
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
    # Day boundaries follow the business timezone (MYT), not UTC.
    today = datetime.now(BUSINESS_TZ).date()
    today_start = day_start_utc(today)

    # Date range
    dfrom = today_start - timedelta(days=30)
    dto = day_end_utc(today)
    if from_date:
        try: dfrom = day_start_utc(datetime.fromisoformat(from_date).date())
        except ValueError: pass
    if to_date:
        try: dto = day_end_utc(datetime.fromisoformat(to_date).date())
        except ValueError: pass

    def order_filter(stmt):
        stmt = stmt.where(Order.deleted_at.is_(None))
        if store_id:
            stmt = stmt.where(Order.store_id == store_id)
        return stmt

    # Net revenue per order: Σ(captured − refunded) over the order's payments.
    # Gross order totals overstate refunded orders; the old payment_status ==
    # "captured" filter also dropped partially_refunded orders entirely.
    net_rev = (
        select(
            Payment.order_id.label("order_id"),
            func.sum(Payment.captured_amount - Payment.refunded_amount).label("net"),
        )
        .where(Payment.status.in_(("captured", "partially_refunded", "refunded")))
        .group_by(Payment.order_id)
        .subquery()
    )

    def revenue_filter(stmt):
        return order_filter(stmt.select_from(Order).join(net_rev, net_rev.c.order_id == Order.id))

    # Counts
    stores = (await db.execute(select(func.count()).select_from(Store).where(Store.deleted_at.is_(None)))).scalar() or 0
    menu_items = (await db.execute(select(func.count()).select_from(MenuItem).where(MenuItem.deleted_at.is_(None)))).scalar() or 0
    inventory_items = (await db.execute(select(func.count()).select_from(InventoryItem).where(InventoryItem.deleted_at.is_(None)))).scalar() or 0
    staff = (await db.execute(select(func.count()).select_from(StaffProfile).where(StaffProfile.deleted_at.is_(None), StaffProfile.is_active.is_(True)))).scalar() or 0
    customers = (await db.execute(select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None), Customer.anonymized_at.is_(None)))).scalar() or 0

    # Today — counts use the same paid population as revenue (any order with
    # captured/partially_refunded/refunded payments), so a partially refunded
    # order counts as an order AND contributes its net revenue.
    orders_today = (await db.execute(revenue_filter(select(func.count()).where(Order.created_at >= today_start)))).scalar() or 0
    # Revenue = net money actually received (captured minus refunded payments —
    # pending PWA online orders and unpaid walkaways are not revenue)
    revenue_today = (await db.execute(revenue_filter(select(func.coalesce(func.sum(net_rev.c.net), 0.0)).where(Order.created_at >= today_start)))).scalar() or 0

    # Total in range
    total_orders = (await db.execute(revenue_filter(select(func.count()).where(Order.created_at >= dfrom, Order.created_at <= dto)))).scalar() or 0
    total_revenue = (await db.execute(revenue_filter(select(func.coalesce(func.sum(net_rev.c.net), 0.0)).where(Order.created_at >= dfrom, Order.created_at <= dto)))).scalar() or 0
    active_orders = (await db.execute(order_filter(select(func.count()).select_from(Order).where(Order.status.in_(("pending", "confirmed", "preparing")))))).scalar() or 0

    # Orders by type
    type_result = await db.execute(
        revenue_filter(
            select(Order.order_type, func.count(), func.sum(net_rev.c.net))
            .where(Order.created_at >= dfrom, Order.created_at <= dto)
            .group_by(Order.order_type)
        )
    )
    orders_by_type = {}
    for row in type_result:
        orders_by_type[row[0]] = {"count": row[1], "revenue": row[2] or 0}

    # Monthly data
    monthly_result = await db.execute(
        revenue_filter(
            select(
                extract("year", Order.created_at).label("y"),
                extract("month", Order.created_at).label("m"),
                func.count(),
                func.sum(net_rev.c.net),
            )
            .where(Order.created_at >= dfrom, Order.created_at <= dto)
            .group_by("y", "m")
            .order_by("y", "m")
        )
    )
    monthly_data = [
        {"year": int(r[0]), "month": int(r[1]), "orders": r[2], "revenue": r[3] or 0}
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
