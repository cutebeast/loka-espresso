"""Loyalty domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class LoyaltyTierBase(BaseSchema):
    tier_key: str = Field(..., max_length=50)
    display_name: str = Field(..., max_length=50)
    min_lifetime_points: int = Field(..., ge=0)
    points_multiplier: float = Field(default=1.0, ge=1.0)
    benefits_config: dict | None = None
    color_hex: str | None = Field(None, max_length=7)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class LoyaltyTierOut(LoyaltyTierBase, TimestampedSchema):
    id: int


class LoyaltyAccountOut(BaseSchema):
    id: int
    customer_id: int
    customer_name: str | None = None
    tier_id: int
    tier_name: str
    tier_key: str | None = None
    color_hex: str | None = None
    current_points: int
    lifetime_points: int
    points_to_next_tier: int | None
    tier_multiplier: float
    last_activity_at: datetime | None
    last_tier_change_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LoyaltyPointsLedgerOut(BaseSchema):
    id: int
    loyalty_account_id: int
    customer_id: int
    customer_name: str | None = None
    event_type: Literal[
        "order_earned",
        "referral_bonus",
        "birthday_bonus",
        "welcome_bonus",
        "tier_bonus",
        "promo_bonus",
        "social_share",
        "review_submitted",
        "manual_adjustment",
        "reward_redemption",
        "voucher_conversion",
        "points_expired",
        "return_deduction",
        "account_merge",
    ]
    points_delta: int
    running_balance: int
    order_id: int | None
    reward_catalog_id: int | None
    description: str | None
    expires_at: datetime | None
    created_at: datetime


class RewardCatalogBase(BaseSchema):
    reward_name: str = Field(..., min_length=1, max_length=100)
    reward_key: str = Field(..., min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)
    short_description: str | None = Field(None, max_length=255)
    long_description: str | None = None
    reward_type: Literal["free_item", "percentage_discount", "fixed_discount", "free_delivery", "points_multiplier", "bundle_deal", "buy_x_get_y"]
    points_cost: int = Field(..., gt=0)
    menu_item_id: int | None = None
    discount_value: float | None = Field(None, ge=0)
    discount_max_amount: float | None = Field(None, ge=0)
    minimum_order_value: float = Field(default=0.0, ge=0)
    maximum_redemptions: int | None = Field(None, gt=0)
    image_url: str | None = Field(None, max_length=500)
    validity_days: int = Field(default=30, gt=0)
    is_exclusive: bool = False
    minimum_tier_id: int | None = None
    terms_and_conditions: str | None = None
    how_to_redeem: str | None = None
    position: int = Field(default=0, ge=0)
    customer_segments: dict | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)
    is_active: bool = True


class RewardCatalogCreate(RewardCatalogBase):
    pass

class RewardCatalogUpdate(BaseSchema):
    reward_name: str | None = Field(None, min_length=1, max_length=100)
    reward_key: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = Field(None, max_length=500)
    short_description: str | None = Field(None, max_length=255)
    long_description: str | None = None
    reward_type: Literal["free_item", "percentage_discount", "fixed_discount", "free_delivery", "points_multiplier", "bundle_deal", "buy_x_get_y"] | None = None
    points_cost: int | None = Field(None, gt=0)
    menu_item_id: int | None = None
    discount_value: float | None = Field(None, ge=0)
    discount_max_amount: float | None = Field(None, ge=0)
    minimum_order_value: float | None = Field(None, ge=0)
    maximum_redemptions: int | None = Field(None, gt=0)
    image_url: str | None = Field(None, max_length=500)
    validity_days: int | None = Field(None, gt=0)
    is_exclusive: bool | None = None
    minimum_tier_id: int | None = None
    terms_and_conditions: str | None = None
    how_to_redeem: str | None = None
    position: int | None = Field(None, ge=0)
    customer_segments: dict | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class RewardCatalogOut(RewardCatalogBase, TimestampedSchema):
    id: int
    total_redemptions: int


class CustomerRewardOut(BaseSchema):
    id: int
    customer_id: int
    reward_catalog_id: int
    redemption_code: str
    reward_name: str | None = None
    status: Literal["active", "reserved", "used", "expired", "cancelled"]
    points_spent: int = 0
    order_id: int | None = None
    used_at: datetime | None = None
    expires_at: datetime
    created_at: datetime
