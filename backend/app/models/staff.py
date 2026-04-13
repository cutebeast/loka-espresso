import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class StaffRole(str, enum.Enum):
    manager = "manager"
    assistant_manager = "assistant_manager"
    barista = "barista"
    cashier = "cashier"
    delivery = "delivery"


class Staff(Base):
    __tablename__ = "staff"
    # DB has partial unique index: (store_id, user_id) WHERE user_id IS NOT NULL
    # enforced by migration d1e2f3a4b5c6, not by SQLAlchemy __table_args__

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(Enum(StaffRole), default=StaffRole.barista, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    pin_code = Column(String(10), nullable=True)  # Quick login PIN
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    shifts = relationship("StaffShift", back_populates="staff", cascade="all, delete-orphan")
    store_rel = relationship("Store")


class StaffShift(Base):
    __tablename__ = "staff_shifts"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id"), nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    clock_in = Column(DateTime(timezone=True), nullable=False)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    staff = relationship("Staff", back_populates="shifts")


class PinAttempt(Base):
    """Database-backed PIN rate limiting. Persists across process restarts."""
    __tablename__ = "pin_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    attempted_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow())
