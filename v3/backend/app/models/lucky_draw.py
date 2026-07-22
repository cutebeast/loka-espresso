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

    __table_args__ = (
        CheckConstraint("spins_per_day > 0", name="ck_lucky_draw_campaigns_spins_per_day"),
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
