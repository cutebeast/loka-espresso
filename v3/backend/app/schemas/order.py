"""Order domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema


class OrderLineItemOut(BaseSchema):
    id: int
    order_id: int
    menu_item_id: int
    menu_variant_id: int | None
    item_snapshot: dict | None
    quantity: int
    unit_price: float
    modifier_total: float
    line_total: float
    selected_modifiers: dict | list = {}
    special_instructions: str | None
    bundle_product_id: int | None = None
    bundle_component_id: int | None = None
    name: str | None = None
    image_url: str | None = None
    fulfillment_status: str | None
    served_at: datetime | None
    served_by: int | None
    created_at: datetime


class OrderStatusLogOut(BaseSchema):
    id: int
    order_id: int
    from_status: str | None
    to_status: str
    reason: str | None
    actor_type: str
    actor_id: int | None
    created_at: datetime


class OrderAdjustmentOut(BaseSchema):
    id: int
    order_id: int
    adjustment_type: str
    amount_delta: float
    reason: str
    approved_by: int | None
    created_at: datetime


class OrderFulfillmentOut(BaseSchema):
    id: int
    order_id: int
    status: str
    customer_address_id: int | None
    delivery_address_snapshot: dict | None
    recipient_name: str | None
    recipient_phone: str | None
    estimated_ready_at: datetime | None
    estimated_delivery_at: datetime | None
    actual_ready_at: datetime | None
    actual_delivery_at: datetime | None
    delivery_provider: str | None
    tracking_url: str | None
    tracking_number: str | None
    driver_name: str | None
    driver_phone: str | None
    pickup_code: str | None
    assigned_staff_id: int | None
    assigned_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    delivery_fee_snapshot: float
    delivery_distance_km: float | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class OrderCreate(BaseSchema):
    store_id: int
    cart_id: int  # Ownership (customer_id matching) is validated in the service layer (create_order_from_cart), not at schema level
    order_type: Literal["dine_in", "takeaway", "delivery", "drive_thru"]
    fulfillment_type: Literal["dine_in_service", "counter_pickup", "curbside_pickup", "standard_delivery", "express_delivery", "third_party_delivery"] = "counter_pickup"
    dining_table_id: int | None = None
    payment_method_id: int | None = None
    voucher_code: str | None = Field(None, max_length=50)
    reward_id: int | None = None
    customer_notes: str | None = Field(None, max_length=500)
    tip_amount: float | None = Field(None, ge=0)


class OrderOut(BaseSchema):
    id: int
    customer_id: int
    store_id: int
    order_number: str
    order_type: str
    order_channel: str
    status: str
    payment_status: str
    fulfillment_type: str
    dining_table_id: int | None
    item_count: int
    items_subtotal: float
    modifier_subtotal: float
    delivery_fee: float
    service_charge: float
    tax_amount: float
    discount_amount: float
    voucher_discount: float
    reward_discount: float
    addon_discount: float
    tip_amount: float
    total_amount: float
    total_amount_currency: str
    loyalty_points_earned: int
    loyalty_points_redeemed: int
    customer_notes: str | None
    staff_notes: str | None
    source_ip: str | None
    device_fingerprint: str | None
    confirmed_at: datetime | None
    prepared_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    cancelled_by: str | None
    store_name: str | None = None
    store_address: str | None = None
    payment_method: str | None = None
    line_items: list[OrderLineItemOut] = []
    fulfillment: OrderFulfillmentOut | None = None
    status_log: list[OrderStatusLogOut] = []
    adjustments: list[OrderAdjustmentOut] = []
    created_at: datetime
    updated_at: datetime


class OrderListParams(BaseSchema):
    status: str | None = None
    store_id: int | None = None
    order_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)


class UpdateOrderStatusRequest(BaseSchema):
    status: str


class ProcessOrderPaymentRequest(BaseSchema):
    payment_method: str = "cash"
    amount_tendered: float = Field(0, ge=0)
    amount: float | None = Field(None, ge=0)
    discount_amount: float = Field(0, ge=0)
    discount_type: str | None = None
    tip_amount: float = Field(0, ge=0)


class ApplyOrderVoucherRequest(BaseSchema):
    voucher_code: str


class ApplyOrderRewardRequest(BaseSchema):
    reward_id: int = Field(..., gt=0)


class PayWithWalletRequest(BaseSchema):
    amount: float = Field(..., gt=0)
