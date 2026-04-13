from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DashboardStats(BaseModel):
    total_orders: int = 0
    total_revenue: float = 0
    total_customers: int = 0
    orders_today: int = 0
    revenue_today: float = 0
    orders_by_type: Optional[dict] = None
    revenue_by_store: Optional[dict] = None


class SalesReport(BaseModel):
    from_date: datetime
    to_date: datetime
    store_id: Optional[int] = None
    group_by: Optional[str] = None
    data: list[dict] = []


class PopularItem(BaseModel):
    item_id: int
    item_name: str
    order_count: int
    revenue: float


class RevenueReport(BaseModel):
    data: list[dict] = []
    total: float = 0


class ExportRequest(BaseModel):
    from_date: datetime
    to_date: datetime
    type: str = "orders"
    store_id: Optional[int] = None


class AppConfigOut(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True


class AppConfigUpdate(BaseModel):
    value: str
