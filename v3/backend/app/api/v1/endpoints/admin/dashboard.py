"""Admin dashboard endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.customer import Customer
from app.models.inventory import InventoryCategory, InventoryItem, Supplier
from app.models.menu import MenuItem
from app.models.order import Order
from app.models.staff import StaffProfile
from app.models.store import Store
from app.schemas.base import APIResponse, BaseSchema

router = APIRouter(prefix="/admin/dashboard", tags=["admin — dashboard"])


class DashboardMetricsOut(BaseSchema):
    stores: int
    menu_items: int
    inventory_items: int
    suppliers: int
    staff: int
    customers: int
    orders_today: int
    revenue_today: float


@router.get("/metrics", response_model=APIResponse[DashboardMetricsOut])
async def dashboard_metrics(db: DBDependency, admin: CurrentAdmin):
    """Get dashboard summary counts."""
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

    stores = await db.execute(
        select(func.count()).select_from(Store).where(Store.deleted_at.is_(None))
    )
    menu_items = await db.execute(
        select(func.count()).select_from(MenuItem).where(MenuItem.deleted_at.is_(None))
    )
    inventory_items = await db.execute(
        select(func.count()).select_from(InventoryItem).where(InventoryItem.deleted_at.is_(None))
    )
    suppliers_count = await db.execute(
        select(func.count()).select_from(Supplier).where(Supplier.deleted_at.is_(None))
    )
    staff = await db.execute(
        select(func.count()).select_from(StaffProfile).where(StaffProfile.deleted_at.is_(None))
    )
    customers = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None))
    )
    orders_today = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(Order.created_at >= today_start, Order.deleted_at.is_(None))
    )
    revenue_today = await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0.0))
        .select_from(Order)
        .where(Order.created_at >= today_start, Order.deleted_at.is_(None))
    )

    return APIResponse(
        data=DashboardMetricsOut(
            stores=stores.scalar() or 0,
            menu_items=menu_items.scalar() or 0,
            inventory_items=inventory_items.scalar() or 0,
            suppliers=suppliers_count.scalar() or 0,
            staff=staff.scalar() or 0,
            customers=customers.scalar() or 0,
            orders_today=orders_today.scalar() or 0,
            revenue_today=float(revenue_today.scalar() or 0),
        )
    )
