from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from app.models.order import OrderType, OrderStatus


class OrderCreate(BaseModel):
    order_type: OrderType
    store_id: int
    checkout_token: Optional[str] = None
    table_id: Optional[int] = None
    pickup_time: Optional[datetime] = None
    delivery_address: Optional[dict] = None
    notes: Optional[str] = None
    payment_method: Optional[str] = None
    voucher_code: Optional[str] = None
    reward_redemption_code: Optional[str] = None
    delivery_provider: Optional[str] = None
    created_at: Optional[datetime] = None

    @field_validator('store_id')
    @classmethod
    def store_id_positive(cls, v):
        if v < 0:
            raise ValueError('store_id must be non-negative')
        return v

    @field_validator('notes')
    @classmethod
    def notes_length(cls, v):
        if v and len(v) > 2000:
            raise ValueError('notes must be <= 2000 characters')
        return v


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    note: Optional[str] = None
    completed_at: Optional[datetime] = None


class OrderItemOut(BaseModel):
    id: int
    order_id: int
    menu_item_id: Optional[int] = None
    name: str
    quantity: int
    unit_price: float
    customizations: Optional[dict] = None
    line_total: float

    class Config:
        from_attributes = True


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
    # Single discount at checkout (voucher OR reward):
    voucher_discount: float = 0.0
    reward_discount: float = 0.0
    voucher_code: Optional[str] = None
    reward_redemption_code: Optional[str] = None
    total: float
    status: OrderStatus
    pickup_time: Optional[datetime] = None
    delivery_address: Optional[dict] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    loyalty_points_earned: int = 0
    notes: Optional[str] = None
    delivery_provider: Optional[str] = None
    delivery_status: Optional[str] = None
    delivery_external_id: Optional[str] = None
    delivery_quote_id: Optional[str] = None
    delivery_tracking_url: Optional[str] = None
    delivery_eta_minutes: Optional[int] = None
    delivery_courier_name: Optional[str] = None
    delivery_courier_phone: Optional[str] = None
    delivery_last_event_at: Optional[datetime] = None
    pos_synced_at: Optional[datetime] = None
    pos_synced_by: Optional[int] = None
    delivery_dispatched_at: Optional[datetime] = None
    delivery_dispatched_by: Optional[int] = None
    staff_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    status_timeline: Optional[list[dict]] = None

    class Config:
        from_attributes = True


class OrderListOut(BaseModel):
    items: list[OrderOut]
    total: int
    page: int
    page_size: int
    total_pages: int = 0


class ApplyVoucherRequest(BaseModel):
    voucher_code: str


class UpdatePaymentStatusRequest(BaseModel):
    payment_status: str
    transaction_id: Optional[str] = None


class StaffNotesRequest(BaseModel):
    staff_notes: Optional[str] = None
