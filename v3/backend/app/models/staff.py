"""Staff & Workforce models."""

from datetime import date, datetime, time, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import ShiftEventType, StaffRole


class StaffProfile(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "staff_profiles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    principal_id: Mapped[int] = mapped_column(
        ForeignKey("iam_principals.id", ondelete="RESTRICT"), nullable=False, unique=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(StaffRole, nullable=False)
    hourly_rate: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pin_last_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tip_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    principal: Mapped["IAMPrincipal"] = relationship("IAMPrincipal", back_populates="staff_profile")
    store: Mapped["Store"] = relationship("Store")
    time_events: Mapped[List["StaffTimeEvent"]] = relationship(
        "StaffTimeEvent", back_populates="staff", cascade="all, delete-orphan"
    )
    tip_allocations: Mapped[List["TipAllocation"]] = relationship(
        "TipAllocation", back_populates="staff"
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('system_admin','regional_manager','store_manager','shift_supervisor','cashier','server','kitchen_staff','delivery_coordinator','readonly_analyst')",
            name="ck_staff_profiles_role",
        ),
        CheckConstraint("hourly_rate >= 0", name="ck_staff_profiles_hourly_rate"),
    )


class StaffShift(Base, TimestampMixin):
    __tablename__ = "staff_shifts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shift_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("shift_templates.id", ondelete="SET NULL"), nullable=True
    )
    shift_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    planned_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    break_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    store: Mapped["Store"] = relationship("Store")
    staff: Mapped["StaffProfile"] = relationship("StaffProfile")
    template: Mapped["ShiftTemplate | None"] = relationship("ShiftTemplate", back_populates="shifts")

    __table_args__ = (
        CheckConstraint("break_duration_minutes >= 0", name="ck_staff_shifts_break_duration_minutes"),
        CheckConstraint(
            "status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')",
            name="ck_staff_shifts_status",
        ),
    )


class ShiftTemplate(Base):
    __tablename__ = "shift_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store: Mapped["Store"] = relationship("Store")
    shifts: Mapped[List["StaffShift"]] = relationship("StaffShift", back_populates="template")


class StaffTimeEvent(Base):
    __tablename__ = "staff_time_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(ShiftEventType, nullable=False)
    event_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(11, 8), nullable=True)
    location_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    device_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    staff: Mapped["StaffProfile"] = relationship("StaffProfile", back_populates="time_events")

    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_staff_time_events_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_staff_time_events_longitude"),
        CheckConstraint(
            "event_type IN ('clock_in','clock_out','break_start','break_end','overtime_start')",
            name="ck_staff_time_events_event_type",
        ),
    )


class TipAllocation(Base):
    __tablename__ = "tip_allocations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    tip_amount: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    tip_percentage: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    allocation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="even_split")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    staff: Mapped["StaffProfile"] = relationship("StaffProfile", back_populates="tip_allocations")

    __table_args__ = (
        CheckConstraint("tip_amount >= 0", name="ck_tip_allocations_tip_amount"),
        CheckConstraint(
            "allocation_type IN ('even_split','percentage','fixed')",
            name="ck_tip_allocations_allocation_type",
        ),
    )
