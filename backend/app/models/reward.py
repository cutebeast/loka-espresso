from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Enum, Text, Integer, ForeignKey, DECIMAL, JSON, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.menu import MenuItem


class RewardType(str, enum.Enum):
    free_item = "free_item"
    discount_voucher = "discount_voucher"
    custom = "custom"


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_type: Mapped[RewardType] = mapped_column(Enum(RewardType), nullable=False)
    item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    discount_value: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    min_spend: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    stock_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_redeemed: Mapped[int] = mapped_column(Integer, default=0)
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    terms: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    how_to_redeem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    short_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    long_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validity_days: Mapped[Optional[int]] = mapped_column(Integer, default=30, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("points_cost >= 0", name="ck_rewards_points_cost"),
        CheckConstraint("discount_value >= 0", name="ck_rewards_discount_value"),
        CheckConstraint("min_spend >= 0", name="ck_rewards_min_spend"),
    )

    menu_item: Mapped[Optional["MenuItem"]] = relationship("MenuItem", foreign_keys=[item_id])


class UserReward(Base):
    __tablename__ = "user_rewards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reward_id: Mapped[int] = mapped_column(Integer, ForeignKey("rewards.id", ondelete="CASCADE"), nullable=False)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    redeemed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[Optional[str]] = mapped_column(String(20), default="available", nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    redemption_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    points_spent: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reward_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    min_spend: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "reward_id", name="uq_user_reward"),
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    reward: Mapped["Reward"] = relationship("Reward", foreign_keys=[reward_id])
