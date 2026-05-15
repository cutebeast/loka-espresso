"""Voucher domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class VoucherDefinitionBase(BaseSchema):
    voucher_code: str = Field(..., max_length=50)
    voucher_type: Literal[
        "percentage_off", "fixed_amount_off", "free_delivery", "free_item",
        "bundle_offer", "referral_reward", "loyalty_exclusive",
    ]
    scope: Literal["global", "store_specific", "category_specific", "item_specific", "customer_segment"] = "global"
    category_id: int | None = None
    menu_item_id: int | None = None
    display_title: str = Field(..., max_length=100)
    description: str | None = None
    discount_value: float = Field(..., ge=0)
    discount_max_amount: float | None = Field(None, ge=0)
    minimum_order_value: float = Field(default=0.0, ge=0)
    maximum_discount: float | None = Field(None, ge=0)
    max_global_uses: int | None = Field(None, gt=0)
    max_uses_per_customer: int = Field(default=1, gt=0)
    valid_from: datetime
    valid_until: datetime
    customer_segments: dict | None = None
    first_order_only: bool = False
    stackable: bool = False
    image_url: str | None = Field(None, max_length=500)
    terms_and_conditions: str | None = None
    how_to_redeem: str | None = None
    short_description: str | None = Field(None, max_length=255)
    long_description: str | None = None
    promo_type: str | None = Field(None, max_length=50)
    validity_days: int | None = None
    is_active: bool = True


class VoucherDefinitionCreate(VoucherDefinitionBase):
    pass


class VoucherDefinitionUpdate(BaseSchema):
    voucher_code: str | None = Field(None, max_length=50)
    voucher_type: Literal[
        "percentage_off", "fixed_amount_off", "free_delivery", "free_item",
        "bundle_offer", "referral_reward", "loyalty_exclusive",
    ] | None = None
    scope: Literal["global", "store_specific", "category_specific", "item_specific", "customer_segment"] | None = None
    category_id: int | None = None
    menu_item_id: int | None = None
    display_title: str | None = Field(None, max_length=100)
    description: str | None = None
    discount_value: float | None = Field(None, ge=0)
    discount_max_amount: float | None = Field(None, ge=0)
    minimum_order_value: float | None = Field(None, ge=0)
    maximum_discount: float | None = Field(None, ge=0)
    max_global_uses: int | None = Field(None, gt=0)
    max_uses_per_customer: int | None = Field(None, gt=0)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    customer_segments: dict | None = None
    first_order_only: bool | None = None
    stackable: bool | None = None
    image_url: str | None = Field(None, max_length=500)
    terms_and_conditions: str | None = None
    how_to_redeem: str | None = None
    short_description: str | None = Field(None, max_length=255)
    long_description: str | None = None
    promo_type: str | None = Field(None, max_length=50)
    validity_days: int | None = None
    is_active: bool | None = None


class VoucherDefinitionOut(VoucherDefinitionBase, TimestampedSchema):
    id: int
    global_use_count: int
    created_by: int | None = None


class CustomerVoucherOut(BaseSchema):
    id: int
    customer_id: int
    voucher_definition_id: int
    voucher_code: str
    status: Literal["active", "reserved", "used", "expired", "revoked"]
    order_id: int | None = None
    use_count: int
    reserved_at: datetime | None = None
    used_at: datetime | None = None
    expires_at: datetime
    source: str
    source_id: int | None = None
    created_at: datetime


class VoucherApplyRequest(BaseSchema):
    voucher_code: str = Field(..., min_length=1, max_length=50)
    order_id: int | None = None
