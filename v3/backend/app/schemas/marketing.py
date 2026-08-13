"""Marketing domain schemas."""

import re
from datetime import datetime
from app.schemas.base import Money
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from app.schemas.base import BaseSchema, TimestampedSchema


# Static audience segments. In addition, dynamic segments are accepted:
# "tier:<tier_key>" (resolved against loyalty_tiers.tier_key at send time).
STATIC_AUDIENCE_SEGMENTS = frozenset({
    "all_users", "new_users", "loyal_customers", "inactive_users", "platinum_members"
})
_TIER_SEGMENT_RE = re.compile(r"^tier:[A-Za-z0-9_\-]{1,45}$")


def _validate_audience_segment(value: str) -> str:
    if value in STATIC_AUDIENCE_SEGMENTS or _TIER_SEGMENT_RE.match(value):
        return value
    raise ValueError(
        "audience_segment must be one of "
        f"{sorted(STATIC_AUDIENCE_SEGMENTS)} or 'tier:<tier_key>'"
    )


AudienceSegment = Annotated[str, AfterValidator(_validate_audience_segment)]


class MarketingCampaignBase(BaseSchema):
    campaign_name: str = Field(..., max_length=100)
    campaign_key: str = Field(..., max_length=50)
    channel: Literal["push_notification", "email", "sms", "in_app", "whatsapp"]
    campaign_type: Literal[
        "promotional", "transactional", "retention", "acquisition", "reactivation"
    ]
    audience_segment: AudienceSegment | None = Field(None, max_length=50)
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
    budget_allocated: Money | None = Field(None, ge=0)
    target_roi: Money | None = None


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
    budget_allocated: Money | None = Field(None, ge=0)
    target_roi: Money | None = None


class MarketingCampaignOut(MarketingCampaignBase, TimestampedSchema):
    id: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    budget_spent: Money = Decimal(0)
    actual_roi: Money | None = None
    created_by: int | None = None
    delivered_count: int | None = None  # computed — set by send endpoint
