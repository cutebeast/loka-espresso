"""Order domain schemas."""
from decimal import Decimal
from app.schemas.base import Money
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
    unit_price: Money
    modifier_total: Money
    line_total: Money
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
    amount_delta: Money
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
    # Courier booking reference keyed in by staff at dispatch (e.g. Lalamove
    # order id) — shown to the customer so they can reference it with the courier.
    delivery_provider_order_id: str | None
    tracking_url: str | None
    tracking_number: str | None
    driver_name: str | None
    driver_phone: str | None
    pickup_code: str | None
    assigned_staff_id: int | None
    assigned_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    delivery_fee_snapshot: Money
    delivery_distance_km: Money | None
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
    delivery_instructions: str | None = Field(None, max_length=500)
    pickup_time: datetime | None = None
    delivery_address: dict | str | None = None
    recipient_name: str | None = Field(None, max_length=100)
    recipient_phone: str | None = Field(None, max_length=20)
    tip_amount: Money | None = Field(None, ge=0)
    is_byot: bool = False  # eco-campaign: customer brought their own tumbler
    idempotency_key: str | None = Field(None, max_length=255)


class OrderOut(BaseSchema):
    id: int
    customer_id: int
    store_id: int
    order_number: str
    order_type: str
    order_channel: str
    status: str
    payment_status: str
    payment_flow: str | None = None
    fulfillment_type: str
    dining_table_id: int | None
    item_count: int
    items_subtotal: Money
    modifier_subtotal: Money
    delivery_fee: Money
    service_charge: Money
    tax_amount: Money
    discount_amount: Money
    voucher_discount: Money
    reward_discount: Money
    addon_discount: Money
    tip_amount: Money
    total_amount: Money
    total_amount_currency: str
    loyalty_points_earned: int
    loyalty_points_redeemed: int
    customer_notes: str | None
    delivery_instructions: str | None
    pickup_time: datetime | None
    estimated_ready_at: datetime | None = None
    delivery_address: dict | str | None = None
    recipient_name: str | None = None
    recipient_phone: str | None = None
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
    # Denormalized for staff/admin detail views (the order's customer row)
    customer_name: str | None = None
    customer_phone: str | None = None
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
    reason: str | None = None


class PaymentLineAllocationIn(BaseSchema):
    """One line-item share covered by a payment (split bill)."""

    line_item_id: int = Field(..., gt=0)
    quantity: Money = Field(..., gt=0)


class ProcessOrderPaymentRequest(BaseSchema):
    payment_method: str = "cash"
    amount_tendered: Money = Field(0, ge=0)
    amount: Money | None = Field(None, ge=0)
    discount_amount: Money = Field(0, ge=0)
    discount_type: str | None = None
    tip_amount: Money = Field(0, ge=0)
    # Split bill: which line items this payment covers. Empty = whole remaining
    # balance (current behaviour). When set, the pro-rated total of the
    # allocations must equal the payment amount.
    allocations: list[PaymentLineAllocationIn] = []
    # Split bill by amount: explicit partial charge (<= remaining balance),
    # e.g. even split N ways. Mutually exclusive with `allocations`.
    charge_amount: Money | None = Field(None, gt=0)


class MergeOrderRequest(BaseSchema):
    """Merge this order into another unpaid order at the same store."""

    target_order_id: int = Field(..., gt=0)


class ApplyOrderVoucherRequest(BaseSchema):
    voucher_code: str

class ApplyOrderRewardRequest(BaseSchema):
    reward_id: int = Field(..., gt=0)


class PayWithWalletRequest(BaseSchema):
    amount: Money = Field(..., gt=0)
