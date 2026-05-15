"""Store Operations models."""

from datetime import date, datetime, time, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import ReservationStatus


class Store(Base, SoftDeleteMixin):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    store_name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    brand_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address_line_1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state_province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False)
    country_code: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(11, 8), nullable=True)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    email_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    currency_code: Mapped[str] = mapped_column(CHAR(3), nullable=False, default="USD")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banner_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pickup_lead_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    delivery_radius_km: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=10.00)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_accepting_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    operating_hours: Mapped[List["StoreOperatingHours"]] = relationship(
        "StoreOperatingHours", back_populates="store", cascade="all, delete-orphan"
    )
    special_hours: Mapped[List["StoreSpecialHours"]] = relationship(
        "StoreSpecialHours", back_populates="store", cascade="all, delete-orphan"
    )
    configuration: Mapped[List["StoreConfiguration"]] = relationship(
        "StoreConfiguration", back_populates="store", cascade="all, delete-orphan"
    )
    dining_tables: Mapped[List["DiningTable"]] = relationship(
        "DiningTable", back_populates="store"
    )
    admin_assignments: Mapped[List["StoreAssignment"]] = relationship(
        "StoreAssignment", back_populates="store"
    )
    inventory_categories: Mapped[List["InventoryCategory"]] = relationship(
        "InventoryCategory", back_populates="store"
    )
    suppliers: Mapped[List["Supplier"]] = relationship(
        "Supplier", back_populates="store"
    )
    carts: Mapped[List["CustomerCart"]] = relationship(
        "CustomerCart", back_populates="store"
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order", back_populates="store"
    )

    __table_args__ = (
        CheckConstraint("pickup_lead_minutes BETWEEN 5 AND 120", name="ck_stores_pickup_lead_minutes"),
        CheckConstraint("delivery_radius_km > 0", name="ck_stores_delivery_radius_km"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_stores_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_stores_longitude"),
    )


class StoreOperatingHours(Base, TimestampMixin):
    __tablename__ = "store_operating_hours"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    open_time: Mapped[time] = mapped_column(nullable=False)
    close_time: Mapped[time] = mapped_column(nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    store: Mapped["Store"] = relationship("Store", back_populates="operating_hours")

    __table_args__ = (
        UniqueConstraint("store_id", "day_of_week"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_store_operating_hours_day_of_week"),
    )


class StoreSpecialHours(Base):
    __tablename__ = "store_special_hours"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    special_date: Mapped[date] = mapped_column(Date, nullable=False)
    open_time: Mapped[time | None] = mapped_column(nullable=True)
    close_time: Mapped[time | None] = mapped_column(nullable=True)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    store: Mapped["Store"] = relationship("Store", back_populates="special_hours")

    __table_args__ = (UniqueConstraint("store_id", "special_date"),)


class StoreConfiguration(Base, TimestampMixin):
    __tablename__ = "store_configuration"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    config_key: Mapped[str] = mapped_column(String(50), nullable=False)
    config_value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    store: Mapped["Store"] = relationship("Store", back_populates="configuration")

    __table_args__ = (UniqueConstraint("store_id", "config_key"),)


class DiningTable(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "dining_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    table_number: Mapped[str] = mapped_column(String(20), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    qr_code_token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    qr_code_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    qr_generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    capacity: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=4)
    section: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    store: Mapped["Store"] = relationship("Store", back_populates="dining_tables")
    status_snapshot: Mapped["TableStatusSnapshot"] = relationship(
        "TableStatusSnapshot", back_populates="table", uselist=False
    )

    __table_args__ = (
        Index("idx_dining_tables_store_number", "store_id", "table_number", unique=True, postgresql_where=text("deleted_at IS NULL")),
        CheckConstraint("capacity BETWEEN 1 AND 50", name="ck_dining_tables_capacity"),
    )


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dining_table_id: Mapped[int | None] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="SET NULL"), nullable=True, index=True
    )
    party_size: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    reservation_date: Mapped[date] = mapped_column(Date, nullable=False)
    reservation_time: Mapped[time] = mapped_column(nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    status: Mapped[str] = mapped_column(ReservationStatus, nullable=False, default="requested")
    special_requests: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    store: Mapped["Store"] = relationship("Store")
    customer: Mapped["Customer | None"] = relationship("Customer", back_populates="reservations")
    dining_table: Mapped["DiningTable | None"] = relationship("DiningTable")

    __table_args__ = (
        CheckConstraint("party_size > 0", name="ck_reservations_party_size"),
        CheckConstraint("duration_minutes > 0", name="ck_reservations_duration_minutes"),
        CheckConstraint(
            "status IN ('requested','confirmed','seated','no_show','cancelled_by_guest','cancelled_by_merchant','completed')",
            name="ck_reservations_status",
        ),
    )


class TableStatusSnapshot(Base):
    __tablename__ = "table_status_snapshot"

    table_id: Mapped[int] = mapped_column(
        ForeignKey("dining_tables.id", ondelete="CASCADE"), primary_key=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    current_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    party_size: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available")
    server_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    table: Mapped["DiningTable"] = relationship("DiningTable", back_populates="status_snapshot")

    __table_args__ = (
        CheckConstraint(
            "status IN ('available','occupied','reserved','cleaning')",
            name="ck_table_status_snapshot_status",
        ),
    )
