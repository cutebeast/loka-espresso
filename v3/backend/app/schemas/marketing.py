"""Marketing domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class MarketingCampaignBase(BaseSchema):
    campaign_name: str = Field(..., max_length=100)
    campaign_key: str = Field(..., max_length=50)
    channel: Literal["push_notification", "email", "sms", "in_app", "whatsapp"]
    campaign_type: Literal[
        "promotional", "transactional", "retention", "acquisition", "reactivation"
    ]
    audience_segment: str | None = Field(None, max_length=50)
    audience_criteria: dict | None = None
    subject_line: str | None = Field(None, max_length=200)
    body_content: str | None = None
    template_variables: dict | None = None
    hero_image_url: str | None = Field(None, max_length=500)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    voucher_definition_id: int | None = None
    reward_catalog_id: int | None = None
    ab_test_variant: Literal["A", "B"] | None = None
    ab_test_criteria: dict | None = None
    scheduled_at: datetime | None = None
    status: Literal[
        "draft", "review_pending", "scheduled", "active", "paused", "completed", "cancelled"
    ] = "draft"
    provider: str | None = Field(None, max_length=50)
    provider_campaign_id: str | None = Field(None, max_length=100)
    budget_allocated: float | None = Field(None, ge=0)
    target_roi: float | None = None


class MarketingCampaignCreate(MarketingCampaignBase):
    pass


class MarketingCampaignUpdate(BaseSchema):
    campaign_name: str | None = Field(None, max_length=100)
    campaign_key: str | None = Field(None, max_length=50)
    channel: Literal["push_notification", "email", "sms", "in_app", "whatsapp"] | None = None
    campaign_type: Literal[
        "promotional", "transactional", "retention", "acquisition", "reactivation"
    ] | None = None
    audience_segment: str | None = Field(None, max_length=50)
    audience_criteria: dict | None = None
    subject_line: str | None = Field(None, max_length=200)
    body_content: str | None = None
    template_variables: dict | None = None
    hero_image_url: str | None = Field(None, max_length=500)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    voucher_definition_id: int | None = None
    reward_catalog_id: int | None = None
    ab_test_variant: Literal["A", "B"] | None = None
    ab_test_criteria: dict | None = None
    scheduled_at: datetime | None = None
    status: Literal[
        "draft", "review_pending", "scheduled", "active", "paused", "completed", "cancelled"
    ] | None = None
    provider: str | None = Field(None, max_length=50)
    provider_campaign_id: str | None = Field(None, max_length=100)
    budget_allocated: float | None = Field(None, ge=0)
    target_roi: float | None = None


class MarketingCampaignOut(MarketingCampaignBase, TimestampedSchema):
    id: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    budget_spent: float = 0
    actual_roi: float | None = None
    created_by: int | None = None
    delivered_count: int | None = None  # computed — set by send endpoint
