"""Lucky draw (spin wheel) models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class LuckyDrawCampaign(Base, TimestampMixin):
    __tablename__ = "lucky_draw_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    spins_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # free_daily: free spins per rolling interval of this many days
    # (1 = daily, 7 = weekly, 30 = monthly). spins_per_day is the per-interval cap.
    spin_interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # "free_daily" (spins_per_day per customer per day) or "ticket_spend"
    # (tickets earned from spending; each spin consumes one).
    draw_type: Mapped[str] = mapped_column(String(20), nullable=False, default="free_daily")
    # ticket_spend: cents of spend per ticket (5000 = RM 50). Per-order floor.
    spend_per_ticket_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=5000)
    # Wheel size control — max active segments allowed on this campaign (2-12).
    max_segments: Mapped[int] = mapped_column(Integer, nullable=False, default=8)

    segments: Mapped[List["LuckyDrawSegment"]] = relationship(
        "LuckyDrawSegment",
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="LuckyDrawSegment.sort_order",
    )
    spins: Mapped[List["LuckyDrawSpin"]] = relationship(
        "LuckyDrawSpin",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )
    tickets: Mapped[List["LuckyDrawTicket"]] = relationship(
        "LuckyDrawTicket",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("spins_per_day > 0", name="ck_lucky_draw_campaigns_spins_per_day"),
        CheckConstraint(
            "spin_interval_days >= 1",
            name="ck_lucky_draw_campaigns_spin_interval_days",
        ),
        CheckConstraint(
            "draw_type IN ('free_daily','ticket_spend')",
            name="ck_lucky_draw_campaigns_draw_type",
        ),
        CheckConstraint(
            "spend_per_ticket_cents > 0",
            name="ck_lucky_draw_campaigns_spend_per_ticket",
        ),
        CheckConstraint(
            "max_segments BETWEEN 2 AND 12",
            name="ck_lucky_draw_campaigns_max_segments",
        ),
        CheckConstraint(
            "start_date IS NULL OR end_date IS NULL OR end_date > start_date",
            name="ck_lucky_draw_campaigns_dates",
        ),
    )


class LuckyDrawSegment(Base, TimestampMixin):
    __tablename__ = "lucky_draw_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("lucky_draw_campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    voucher_definition_id: Mapped[int] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="RESTRICT"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    color_hex: Mapped[str] = mapped_column(String(20), nullable=False, default="#8B5E34")
    probability_weight: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    campaign: Mapped["LuckyDrawCampaign"] = relationship(
        "LuckyDrawCampaign", back_populates="segments"
    )
    voucher_definition: Mapped["VoucherDefinition"] = relationship("VoucherDefinition")
    spins: Mapped[List["LuckyDrawSpin"]] = relationship(
        "LuckyDrawSpin", back_populates="segment"
    )

    __table_args__ = (
        CheckConstraint(
            "probability_weight > 0", name="ck_lucky_draw_segments_probability_weight"
        ),
        CheckConstraint("sort_order >= 0", name="ck_lucky_draw_segments_sort_order"),
    )


class LuckyDrawSpin(Base):
    __tablename__ = "lucky_draw_spins"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("lucky_draw_campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("lucky_draw_segments.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    customer_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_vouchers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    campaign: Mapped["LuckyDrawCampaign"] = relationship(
        "LuckyDrawCampaign", back_populates="spins"
    )
    segment: Mapped["LuckyDrawSegment | None"] = relationship(
        "LuckyDrawSegment", back_populates="spins"
    )
    customer: Mapped["Customer"] = relationship("Customer")
    customer_voucher: Mapped["CustomerVoucher | None"] = relationship("CustomerVoucher")

    __table_args__ = (
        Index("idx_lucky_draw_spins_customer_created", "customer_id", "created_at"),
    )


class LuckyDrawTicket(Base):
    """Spend-earned draw ticket (ticket_spend campaigns).

    One row per ticket; `order_ticket_seq` numbers tickets within an order
    (RM 120 at RM50/ticket → seq 1..2). Grants are idempotent via the
    (campaign_id, order_id, order_ticket_seq) unique constraint. Consumed
    tickets link to the spin that used them. Refunds do not claw tickets back.
    """

    __tablename__ = "lucky_draw_tickets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("lucky_draw_campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    order_ticket_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    spin_id: Mapped[int | None] = mapped_column(
        ForeignKey("lucky_draw_spins.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["LuckyDrawCampaign"] = relationship(
        "LuckyDrawCampaign", back_populates="tickets"
    )
    customer: Mapped["Customer"] = relationship("Customer")

    __table_args__ = (
        UniqueConstraint(
            "campaign_id", "order_id", "order_ticket_seq",
            name="uq_lucky_draw_tickets_campaign_order_seq",
        ),
        Index("idx_lucky_draw_tickets_customer_avail", "campaign_id", "customer_id", "consumed_at"),
    )
