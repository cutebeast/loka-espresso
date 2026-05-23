"""Rewards & Promotions models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
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

from decimal import Decimal

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import RewardRedemptionType


class RewardCatalog(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "reward_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reward_name: Mapped[str] = mapped_column(String(100), nullable=False)
    reward_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reward_type: Mapped[str] = mapped_column(RewardRedemptionType, nullable=False)
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    menu_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    discount_max_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    minimum_order_value: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    maximum_redemptions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_redemptions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    is_exclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    minimum_tier_id: Mapped[int | None] = mapped_column(
        ForeignKey("loyalty_tiers.id", ondelete="SET NULL"), nullable=True
    )
    terms_and_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    how_to_redeem: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customer_segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    customer_rewards: Mapped[List["CustomerReward"]] = relationship(
        "CustomerReward",
        back_populates="reward_catalog",
        cascade="all, delete-orphan",
    )
    ledger_entries: Mapped[List["LoyaltyPointsLedger"]] = relationship(
        "LoyaltyPointsLedger", back_populates="reward_catalog"
    )

    __table_args__ = (
        CheckConstraint(
            "reward_type IN ('free_item','percentage_discount','fixed_discount','free_delivery','points_multiplier','bundle_deal','buy_x_get_y')",
            name="ck_reward_catalog_reward_type",
        ),
        CheckConstraint("points_cost > 0", name="ck_reward_catalog_points_cost"),
        CheckConstraint("discount_value >= 0", name="ck_reward_catalog_discount_value"),
        CheckConstraint("minimum_order_value >= 0", name="ck_reward_catalog_minimum_order_value"),
        CheckConstraint("maximum_redemptions IS NULL OR maximum_redemptions > 0", name="ck_reward_catalog_maximum_redemptions"),
        CheckConstraint("total_redemptions >= 0", name="ck_reward_catalog_total_redemptions"),
        CheckConstraint("validity_days > 0", name="ck_reward_catalog_validity_days"),
    )


class CustomerReward(Base):
    __tablename__ = "customer_rewards"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    reward_catalog_id: Mapped[int] = mapped_column(
        ForeignKey("reward_catalog.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="RESTRICT"), nullable=False
    )
    redemption_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    points_spent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="customer_rewards")
    reward_catalog: Mapped["RewardCatalog"] = relationship(
        "RewardCatalog", back_populates="customer_rewards"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','reserved','used','expired','cancelled')",
            name="ck_customer_rewards_status",
        ),
        CheckConstraint("points_spent >= 0", name="ck_customer_rewards_points_spent"),
    )
