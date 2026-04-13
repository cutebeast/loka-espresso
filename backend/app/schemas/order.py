import enum
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrderType(str, enum.Enum):
    dine_in = "dine_in"
    pickup = "pickup"
    delivery = "delivery"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    preparing = "preparing"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class OrderCreate(BaseModel):
    order_type: OrderType
    store_id: int
    table_id: Optional[int] = None
    pickup_time: Optional[datetime] = None
    delivery_address: Optional[dict] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    voucher_code: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    note: Optional[str] = None


class OrderOut(BaseModel):
    id: int
    user_id: int
    store_id: int
    table_id: Optional[int] = None
    order_number: str
    order_type: OrderType
    items: list[dict]
    subtotal: float
    delivery_fee: float = 0
    discount: float = 0
    total: float
    status: OrderStatus
    pickup_time: Optional[datetime] = None
    delivery_address: Optional[dict] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    loyalty_points_earned: int = 0
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    status_timeline: Optional[list[dict]] = None

    class Config:
        from_attributes = True


class OrderListOut(BaseModel):
    orders: list[OrderOut]
    total: int
    page: int
    page_size: int
