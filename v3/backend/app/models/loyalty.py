"""Loyalty Engine models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
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
from app.models.enums import LoyaltyEventType


class LoyaltyTier(Base, TimestampMixin):
    __tablename__ = "loyalty_tiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tier_key: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    min_lifetime_points: Mapped[int] = mapped_column(Integer, nullable=False)
    points_multiplier: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False, default=1.00)
    benefits_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    color_hex: Mapped[str | None] = mapped_column(CHAR(7), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    accounts: Mapped[List["LoyaltyAccount"]] = relationship(
        "LoyaltyAccount", back_populates="current_tier"
    )

    __table_args__ = (
        CheckConstraint("min_lifetime_points >= 0", name="ck_loyalty_tiers_min_lifetime_points"),
        CheckConstraint("points_multiplier >= 1.00", name="ck_loyalty_tiers_points_multiplier"),
    )


class LoyaltyAccount(Base, TimestampMixin):
    __tablename__ = "loyalty_accounts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    current_tier_id: Mapped[int | None] = mapped_column(
        ForeignKey("loyalty_tiers.id", ondelete="SET NULL"), nullable=True
    )
    points_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lifetime_points_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lifetime_points_redeemed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_pending_expiry: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_tier_change_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="loyalty_account")
    current_tier: Mapped["LoyaltyTier | None"] = relationship(
        "LoyaltyTier", back_populates="accounts"
    )
    ledger_entries: Mapped[List["LoyaltyPointsLedger"]] = relationship(
        "LoyaltyPointsLedger",
        back_populates="loyalty_account",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("points_balance >= 0", name="ck_loyalty_accounts_points_balance"),
        CheckConstraint("lifetime_points_earned >= 0", name="ck_loyalty_accounts_lifetime_points_earned"),
        CheckConstraint("lifetime_points_redeemed >= 0", name="ck_loyalty_accounts_lifetime_points_redeemed"),
    )


class LoyaltyPointsLedger(Base):
    __tablename__ = "loyalty_points_ledger"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    loyalty_account_id: Mapped[int] = mapped_column(
        ForeignKey("loyalty_accounts.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(LoyaltyEventType, nullable=False)
    points_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    running_balance: Mapped[int] = mapped_column(Integer, nullable=False)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    reward_catalog_id: Mapped[int | None] = mapped_column(
        ForeignKey("reward_catalog.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    loyalty_account: Mapped["LoyaltyAccount"] = relationship(
        "LoyaltyAccount", back_populates="ledger_entries"
    )
    reward_catalog: Mapped["RewardCatalog | None"] = relationship("RewardCatalog", back_populates="ledger_entries")

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('earn_purchase','earn_bonus','earn_referral','redeem_reward','redeem_discount','adjust_manual','expire_points','tier_upgrade','tier_downgrade','welcome_bonus')",
            name="ck_loyalty_points_ledger_event_type",
        ),
    )
