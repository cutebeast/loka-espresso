import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class StaffRole(str, enum.Enum):
    manager = "manager"
    barista = "barista"
    cashier = "cashier"
    delivery = "delivery"


class Staff(Base):
    __tablename__ = "staff"

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
