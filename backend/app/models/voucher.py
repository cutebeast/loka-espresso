from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Enum, Text, Integer, ForeignKey, DECIMAL, JSON, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.store import Store


class DiscountType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"
    free_item = "free_item"


class Voucher(Base):
    __tablename__ = "vouchers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    discount_type: Mapped[DiscountType] = mapped_column(Enum(DiscountType), nullable=False)
    discount_value: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    min_spend: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    max_uses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    promo_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    terms: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    how_to_redeem: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    short_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    long_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validity_days: Mapped[Optional[int]] = mapped_column(Integer, default=30, nullable=True)
    max_uses_per_user: Mapped[Optional[int]] = mapped_column(Integer, default=1, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("discount_value >= 0", name="ck_vouchers_discount_value"),
    )

    store: Mapped[Optional["Store"]] = relationship("Store", foreign_keys=[store_id])


class UserVoucher(Base):
    __tablename__ = "user_vouchers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    voucher_id: Mapped[int] = mapped_column(Integer, ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    source_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(20), default="available", nullable=True)
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reserved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    discount_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    discount_value: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    min_spend: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "voucher_id", name="uq_user_voucher"),
        Index("ix_user_vouchers_user_status", "user_id", "status"),
    )

    user: Mapped["Customer"] = relationship("Customer", foreign_keys=[user_id])
    voucher: Mapped["Voucher"] = relationship("Voucher", foreign_keys=[voucher_id])
