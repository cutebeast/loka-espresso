import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    address = Column(Text, nullable=True)
    lat = Column(DECIMAL(10, 7), nullable=True)
    lng = Column(DECIMAL(10, 7), nullable=True)
    phone = Column(String(20), nullable=True)
    image_url = Column(String(500), nullable=True)
    opening_hours = Column(JSON, nullable=True)
    pickup_lead_minutes = Column(Integer, default=15)
    delivery_radius_km = Column(DECIMAL(5, 2), default=5.0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    tables = relationship("StoreTable", back_populates="store", cascade="all, delete-orphan")
    categories = relationship("MenuCategory", back_populates="store", cascade="all, delete-orphan")
    items = relationship("MenuItem", back_populates="store", cascade="all, delete-orphan")
    inventory_items = relationship("InventoryItem", back_populates="store", cascade="all, delete-orphan")


class StoreTable(Base):
    __tablename__ = "store_tables"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    table_number = Column(String(20), nullable=False)
    qr_code_url = Column(String(500), nullable=True)
    capacity = Column(Integer, default=4)
    is_active = Column(Boolean, default=True, nullable=False)

    store = relationship("Store", back_populates="tables")
