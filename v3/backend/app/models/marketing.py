"""Marketing Automation models."""

from datetime import datetime, timezone
from sqlalchemy import (
    BigInteger,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import CampaignChannel, CampaignStatus


class MarketingCampaign(Base, TimestampMixin):
    __tablename__ = "marketing_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_name: Mapped[str] = mapped_column(String(100), nullable=False)
    campaign_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    channel: Mapped[str] = mapped_column(CampaignChannel, nullable=False)
    campaign_type: Mapped[str] = mapped_column(String(50), nullable=False)
    audience_segment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    audience_criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    subject_line: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_variables: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    hero_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cta_text: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cta_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    voucher_definition_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="SET NULL"), nullable=True
    )
    reward_catalog_id: Mapped[int | None] = mapped_column(
        ForeignKey("reward_catalog.id", ondelete="SET NULL"), nullable=True
    )
    ab_test_variant: Mapped[str | None] = mapped_column(CHAR(1), nullable=True)
    ab_test_criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(CampaignStatus, nullable=False, default="draft")
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_campaign_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    budget_allocated: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    budget_spent: Mapped[float] = mapped_column(
        Numeric(12, 4), nullable=False, default=0
    )
    target_roi: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    actual_roi: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    analytics: Mapped["CampaignAnalytics | None"] = relationship(
        "CampaignAnalytics", back_populates="campaign", uselist=False
    )

    __table_args__ = (
        CheckConstraint(
            "campaign_type IN ('promotional','transactional','retention','acquisition','reactivation')",
            name="ck_marketing_campaigns_campaign_type",
        ),
        CheckConstraint(
            "ab_test_variant IN ('A','B')",
            name="ck_marketing_campaigns_ab_test_variant",
        ),
        CheckConstraint(
            "status IN ('draft','review_pending','scheduled','active','paused','completed','cancelled')",
            name="ck_marketing_campaigns_status",
        ),
        CheckConstraint("budget_allocated >= 0", name="ck_marketing_campaigns_budget_allocated"),
        CheckConstraint("budget_spent >= 0", name="ck_marketing_campaigns_budget_spent"),
    )


class CampaignAnalytics(Base):
    __tablename__ = "campaign_analytics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("marketing_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    audience_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    messages_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    messages_delivered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    messages_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    messages_bounced: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opens_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_opens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clicks_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unique_clicks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conversions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conversion_revenue: Mapped[float] = mapped_column(
        Numeric(12, 4), nullable=False, default=0
    )
    unsubscribes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spam_reports: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_per_send: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    cost_total: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    campaign: Mapped["MarketingCampaign"] = relationship(
        "MarketingCampaign", back_populates="analytics"
    )

    __table_args__ = (
        CheckConstraint("audience_size >= 0", name="ck_campaign_analytics_audience_size"),
        CheckConstraint("messages_sent >= 0", name="ck_campaign_analytics_messages_sent"),
        CheckConstraint(
            "messages_delivered >= 0", name="ck_campaign_analytics_messages_delivered"
        ),
        CheckConstraint("messages_failed >= 0", name="ck_campaign_analytics_messages_failed"),
        CheckConstraint("messages_bounced >= 0", name="ck_campaign_analytics_messages_bounced"),
        CheckConstraint("opens_count >= 0", name="ck_campaign_analytics_opens_count"),
        CheckConstraint("unique_opens >= 0", name="ck_campaign_analytics_unique_opens"),
        CheckConstraint("clicks_count >= 0", name="ck_campaign_analytics_clicks_count"),
        CheckConstraint("unique_clicks >= 0", name="ck_campaign_analytics_unique_clicks"),
        CheckConstraint(
            "conversion_revenue >= 0", name="ck_campaign_analytics_conversion_revenue"
        ),
        CheckConstraint("unsubscribes >= 0", name="ck_campaign_analytics_unsubscribes"),
        CheckConstraint("spam_reports >= 0", name="ck_campaign_analytics_spam_reports"),
        CheckConstraint("cost_total >= 0", name="ck_campaign_analytics_cost_total"),
    )
