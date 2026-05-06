from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, DECIMAL, JSON, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    opening_hours: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    pickup_lead_minutes: Mapped[int] = mapped_column(Integer, default=15)
    delivery_radius_km: Mapped[float] = mapped_column(DECIMAL(5, 2), default=5.0)
    delivery_fee: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    min_order: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pos_integration_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivery_integration_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("delivery_fee >= 0", name="ck_stores_delivery_fee_nonnegative"),
        CheckConstraint("min_order >= 0", name="ck_stores_min_order_nonnegative"),
    )

    tables: Mapped[List["StoreTable"]] = relationship("StoreTable", back_populates="store", cascade="all, delete-orphan")
    inventory_items: Mapped[List["InventoryItem"]] = relationship("InventoryItem", back_populates="store", cascade="all, delete-orphan")


class StoreTable(Base):
    __tablename__ = "store_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    table_number: Mapped[str] = mapped_column(String(20), nullable=False)
    qr_code_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    qr_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    qr_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=4)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_occupied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_tables_capacity"),
        UniqueConstraint("store_id", "table_number", name="uq_store_table_number"),
    )

    store: Mapped[Store] = relationship("Store", back_populates="tables")
