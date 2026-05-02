from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, DECIMAL, Index, Date
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.acl import UserStoreAccess


class Customer(Base):
    """Customer users — PWA access, OTP auth."""
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    referral_code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    referred_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    referral_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    referral_earnings: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.00, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    addresses: Mapped[List[CustomerAddress]] = relationship("CustomerAddress", back_populates="customer", cascade="all, delete-orphan")
    device_tokens: Mapped[List[CustomerDeviceToken]] = relationship("CustomerDeviceToken", back_populates="customer", cascade="all, delete-orphan")


class CustomerAddress(Base):
    __tablename__ = "customer_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    apartment: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    postcode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_instructions: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_cust_address_default", "customer_id", "is_default"),
    )

    customer: Mapped[Customer] = relationship("Customer", back_populates="addresses")


class CustomerDeviceToken(Base):
    __tablename__ = "customer_device_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(4096), nullable=False)
    platform: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    customer: Mapped[Customer] = relationship("Customer", back_populates="device_tokens")
