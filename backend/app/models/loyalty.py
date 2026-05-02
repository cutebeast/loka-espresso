from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, Integer, Enum, ForeignKey, DECIMAL, Text, JSON, Index, CheckConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.admin_user import AdminUser
    from app.models.store import Store


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    points_balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tier: Mapped[str] = mapped_column(String(50), default="bronze", nullable=False)
    total_points_earned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["Customer"] = relationship("Customer", foreign_keys=[user_id])


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)

    class TxType(str, enum.Enum):
        earn = "earn"
        redeem = "redeem"
        expire = "expire"

    type: Mapped[TxType] = mapped_column(Enum(TxType), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_ltx_user_type", "user_id", "type"),
        Index("ix_ltx_user_created", "user_id", "created_at"),
    )

    user: Mapped["Customer"] = relationship("Customer", foreign_keys=[user_id])
    store: Mapped[Optional["Store"]] = relationship("Store", foreign_keys=[store_id])
    created_by_user: Mapped[Optional["AdminUser"]] = relationship("AdminUser", foreign_keys=[created_by])


class LoyaltyTier(Base):
    __tablename__ = "loyalty_tiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    min_points: Mapped[int] = mapped_column(Integer, nullable=False)
    points_multiplier: Mapped[float] = mapped_column(DECIMAL(3, 2), default=1.0)
    benefits: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("min_points >= 0", name="ck_loyalty_tiers_min_points_nonnegative"),
    )
