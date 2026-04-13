import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, DECIMAL
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
    item_id = Column(Integer, nullable=True)
    discount_value = Column(DECIMAL(10, 2), nullable=True)
    image_url = Column(String(500), nullable=True)
    stock_limit = Column(Integer, nullable=True)
    total_redeemed = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserReward(Base):
    __tablename__ = "user_rewards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reward_id = Column(Integer, ForeignKey("rewards.id"), nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    redeemed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    is_used = Column(Boolean, default=False, nullable=False)
