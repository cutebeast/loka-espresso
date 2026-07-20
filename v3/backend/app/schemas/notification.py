"""Notification domain schemas."""

import re
from datetime import datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, AfterValidator

from app.schemas.base import BaseSchema, TimestampedSchema


class NotificationMessageOut(BaseSchema):
    id: int
    customer_id: int
    message_type: Literal["order_update", "promotion", "system", "payment", "loyalty", "reminder", "security"]
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    title: str
    body: str | None = None
    image_url: str | None = None
    action_url: str | None = None
    action_type: str | None = None
    action_payload: dict | None = None
    is_read: bool = False
    read_at: datetime | None = None
    campaign_id: int | None = None
    expires_at: datetime | None = None
    created_at: datetime


class NotificationDeliveryLogOut(BaseSchema):
    id: int
    message_id: int
    channel: Literal["push_notification", "email", "sms", "in_app", "whatsapp"]
    device_id: int | None = None
    recipient_address: str | None = None
    status: Literal["pending", "sent", "delivered", "read", "failed", "bounced", "unsubscribed"] = "pending"
    provider: str | None = None
    provider_message_id: str | None = None
    provider_response: dict | None = None
    retry_count: int = 0
    error_code: str | None = None
    error_message: str | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationPreferenceOut(TimestampedSchema):
    id: int
    customer_id: int
    channel: Literal["push_notification", "email", "sms", "in_app", "whatsapp"]
    message_category: Literal["all", "order_updates", "promotions", "loyalty", "system"] = "all"
    is_enabled: bool = True
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    timezone: str = "UTC"


class NotificationPreferenceUpdate(BaseSchema):
    is_enabled: bool | None = None
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    timezone: str | None = Field(None, max_length=50)


# ---------------------------------------------------------------------------
# Admin Push Notification schemas (audience-targeted)
# ---------------------------------------------------------------------------

ADMIN_NOTIFICATION_TYPES = Literal[
    "general", "order", "reward", "wallet", "loyalty", "promo", "info", "event"
]
# Static audience segments. In addition, dynamic per-tier segments of the form
# "tier:<tier_key>" (resolved against loyalty_tiers.tier_key) are accepted.
STATIC_AUDIENCE_SEGMENTS = frozenset({
    "all_users", "new_users", "loyal_customers", "inactive_users", "platinum_members"
})
_TIER_SEGMENT_RE = re.compile(r"^tier:[A-Za-z0-9_\-]{1,45}$")
NOTIFICATION_STATUS = Literal["draft", "scheduled", "sent", "failed"]


def _validate_audience_segment(value: str) -> str:
    if value in STATIC_AUDIENCE_SEGMENTS or _TIER_SEGMENT_RE.match(value):
        return value
    raise ValueError(
        "audience_segment must be one of "
        f"{sorted(STATIC_AUDIENCE_SEGMENTS)} or 'tier:<tier_key>'"
    )


AudienceSegment = Annotated[str, AfterValidator(_validate_audience_segment)]


class AdminNotificationBase(BaseSchema):
    title: str = Field(..., max_length=200)
    body: str | None = None
    notification_type: ADMIN_NOTIFICATION_TYPES = "general"
    audience_segment: AudienceSegment = "all_users"
    image_url: str | None = Field(None, max_length=500)
    action_url: str | None = Field(None, max_length=500)
    scheduled_at: datetime | None = None
    status: NOTIFICATION_STATUS = "draft"


class AdminNotificationCreate(AdminNotificationBase):
    pass


class AdminNotificationUpdate(BaseSchema):
    title: str | None = Field(None, max_length=200)
    body: str | None = None
    notification_type: ADMIN_NOTIFICATION_TYPES | None = None
    audience_segment: AudienceSegment | None = None
    image_url: str | None = Field(None, max_length=500)
    action_url: str | None = Field(None, max_length=500)
    scheduled_at: datetime | None = None
    status: NOTIFICATION_STATUS | None = None
    is_archived: bool | None = None


class AdminNotificationOut(AdminNotificationBase, TimestampedSchema):
    id: int
    sent_at: datetime | None = None
    is_archived: bool = False
    created_by: int | None = None
    delivered_count: int | None = None  # computed — set by send endpoint


# ---------------------------------------------------------------------------
# Notification Template schemas
# ---------------------------------------------------------------------------

class NotificationTemplateBase(BaseSchema):
    name: str = Field(..., max_length=100)
    title: str = Field(..., max_length=200)
    body: str | None = None
    notification_type: ADMIN_NOTIFICATION_TYPES = "general"
    audience_segment: AudienceSegment = "all_users"
    image_url: str | None = Field(None, max_length=500)


class NotificationTemplateCreate(NotificationTemplateBase):
    pass


class NotificationTemplateUpdate(BaseSchema):
    name: str | None = Field(None, max_length=100)
    title: str | None = Field(None, max_length=200)
    body: str | None = None
    notification_type: ADMIN_NOTIFICATION_TYPES | None = None
    audience_segment: AudienceSegment | None = None
    image_url: str | None = Field(None, max_length=500)


class NotificationTemplateOut(NotificationTemplateBase, TimestampedSchema):
    id: int
