"""Notification Orchestration models."""

from datetime import datetime, time, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import CampaignChannel, NotificationPriority, NotificationStatus


# ---------------------------------------------------------------------------
# Admin Push Notifications (audience-targeted)
# ---------------------------------------------------------------------------

class AdminNotification(Base, TimestampMixin):
    """Admin-created push notification sent to audience segments."""
    __tablename__ = "admin_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    notification_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general"
    )
    audience_segment: Mapped[str] = mapped_column(
        String(50), nullable=False, default="all_users"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "notification_type IN ('general','order','reward','wallet','loyalty','promo','info','event')",
            name="ck_admin_notifications_type",
        ),
        CheckConstraint(
            "audience_segment IN ('all_users','new_users','loyal_customers','inactive_users','platinum_members')",
            name="ck_admin_notifications_audience",
        ),
        CheckConstraint(
            "status IN ('draft','scheduled','sent','failed')",
            name="ck_admin_notifications_status",
        ),
    )


class NotificationTemplate(Base, TimestampMixin):
    """Reusable notification templates for quick compose."""
    __tablename__ = "notification_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    notification_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general"
    )
    audience_segment: Mapped[str] = mapped_column(
        String(50), nullable=False, default="all_users"
    )
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "notification_type IN ('general','order','reward','wallet','loyalty','promo','info','event')",
            name="ck_notification_templates_type",
        ),
        CheckConstraint(
            "audience_segment IN ('all_users','new_users','loyal_customers','inactive_users','platinum_members')",
            name="ck_notification_templates_audience",
        ),
    )


# ---------------------------------------------------------------------------
# Per-customer notification messages (existing)
# ---------------------------------------------------------------------------


class NotificationMessage(Base):
    __tablename__ = "notification_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    message_type: Mapped[str] = mapped_column(String(50), nullable=False)
    priority: Mapped[str] = mapped_column(NotificationPriority, nullable=False, default="normal")
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    action_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    action_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="notifications")
    delivery_logs: Mapped[List["NotificationDeliveryLog"]] = relationship(
        "NotificationDeliveryLog", back_populates="message", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "message_type IN ('order_update','promotion','system','payment','loyalty','reminder','security')",
            name="ck_notification_messages_message_type",
        ),
        CheckConstraint(
            "priority IN ('low','normal','high','urgent')",
            name="ck_notification_messages_priority",
        ),
    )


class NotificationDeliveryLog(Base):
    __tablename__ = "notification_delivery_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("notification_messages.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(CampaignChannel, nullable=False)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_devices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recipient_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(NotificationStatus, nullable=False, default="pending")
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    retry_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    message: Mapped["NotificationMessage"] = relationship(
        "NotificationMessage", back_populates="delivery_logs"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','sent','delivered','read','failed','bounced','unsubscribed')",
            name="ck_notification_delivery_log_status",
        ),
        CheckConstraint(
            "retry_count BETWEEN 0 AND 5", name="ck_notification_delivery_log_retry_count"
        ),
    )


class NotificationPreference(Base, TimestampMixin):
    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(CampaignChannel, nullable=False)
    message_category: Mapped[str] = mapped_column(
        String(50), nullable=False, default="all"
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    quiet_hours_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    quiet_hours_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")

    customer: Mapped["Customer"] = relationship("Customer", back_populates="notification_preferences")

    __table_args__ = (
        CheckConstraint(
            "message_category IN ('all','order_updates','promotions','loyalty','system')",
            name="ck_notification_preferences_message_category",
        ),
        UniqueConstraint(
            "customer_id", "channel", "message_category", name="uq_notification_preferences"
        ),
    )
