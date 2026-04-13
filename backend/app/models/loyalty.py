import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, DECIMAL, JSON, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    points_balance = Column(Integer, default=0, nullable=False)
    tier = Column(String(50), default="bronze", nullable=False)
    total_points_earned = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    points = Column(Integer, nullable=False)

    class TxType(str, enum.Enum):
        earn = "earn"
        redeem = "redeem"
        expire = "expire"

    type = Column(Enum(TxType), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())


class LoyaltyTier(Base):
    __tablename__ = "loyalty_tiers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    min_points = Column(Integer, nullable=False)
    points_multiplier = Column(DECIMAL(3, 2), default=1.0)
    benefits = Column(JSON, nullable=True)
