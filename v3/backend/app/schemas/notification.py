"""Notification domain schemas."""

from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


class AdminNotificationCreate(BaseSchema):
    customer_ids: list[int] | None = None
    message_type: Literal["order_update", "promotion", "system", "payment", "loyalty", "reminder", "security"] = "system"
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    title: str = Field(..., max_length=100)
    body: str | None = None
    image_url: str | None = Field(None, max_length=500)
    action_url: str | None = Field(None, max_length=500)
    action_type: str | None = Field(None, max_length=50)
    action_payload: dict | None = None
    expires_at: datetime | None = None
