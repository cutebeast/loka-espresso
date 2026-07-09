"""Cart domain schemas."""
from decimal import Decimal
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema


class CartModifierSelection(BaseSchema):
    modifier_group_id: int
    selected_option_ids: list[int]


class CartLineItemBase(BaseSchema):
    menu_item_id: int
    menu_variant_id: int | None = None
    quantity: int = Field(..., ge=1, le=99)
    selected_modifiers: list[CartModifierSelection] = []
    special_instructions: str | None = Field(None, max_length=255)


class CartLineItemCreate(CartLineItemBase):
    bundle_product_id: int | None = None
    bundle_component_id: int | None = None
    customization_option_ids: list[int] | None = None  # legacy PWA format; converted to selected_modifiers


class CartLineItemUpdate(BaseSchema):
    quantity: int | None = Field(None, ge=1, le=99)
    selected_modifiers: list[CartModifierSelection] | None = None
    special_instructions: str | None = Field(None, max_length=255)


class CartLineItemOut(BaseSchema):
    id: int
    cart_id: int
    menu_item_id: int
    menu_variant_id: int | None
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    modifier_total: Decimal
    selected_modifiers: dict | list = {}
    special_instructions: str | None
    item_name: str | None = None
    image_url: str | None = None
    bundle_product_id: int | None = None
    bundle_component_id: int | None = None
    added_at: datetime


class CustomerCartOut(BaseSchema):
    id: int
    customer_id: int
    store_id: int
    item_count: int
    subtotal: Decimal
    last_activity_at: datetime
    line_items: list[CartLineItemOut] = []
    created_at: datetime
    updated_at: datetime


class CheckoutSessionOut(BaseSchema):
    id: int
    token_hash: str
    customer_id: int
    store_id: int
    cart_snapshot: dict
    applied_voucher_id: int | None
    applied_reward_id: int | None
    discount_amount: Decimal
    delivery_fee: Decimal
    tax_amount: Decimal
    subtotal: Decimal
    total_amount: Decimal
    is_completed: bool
    completed_order_id: int | None
    expires_at: datetime
    ip_address: str | None
    device_fingerprint: str | None
    user_agent: str | None
    created_at: datetime
