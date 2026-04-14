import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, DECIMAL, JSON, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class RewardType(str, enum.Enum):
    free_item = "free_item"
    discount_voucher = "discount_voucher"
    custom = "custom"


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    points_cost = Column(Integer, nullable=False)
    reward_type = Column(Enum(RewardType), nullable=False)
    item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=True)
    discount_value = Column(DECIMAL(10, 2), nullable=True)
    image_url = Column(String(500), nullable=True)
    stock_limit = Column(Integer, nullable=True)
    total_redeemed = Column(Integer, default=0)
    code = Column(String(50), unique=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    terms = Column(JSON, nullable=True)
    how_to_redeem = Column(Text, nullable=True)
    short_description = Column(String(500), nullable=True)
    long_description = Column(Text, nullable=True)
    validity_days = Column(Integer, default=30, nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserReward(Base):
    __tablename__ = "user_rewards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reward_id = Column(Integer, ForeignKey("rewards.id"), nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    redeemed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    is_used = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), default="available", nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    redemption_code = Column(String(50), unique=True, nullable=True)
    points_spent = Column(Integer, nullable=True)
    reward_snapshot = Column(JSON, nullable=True)
