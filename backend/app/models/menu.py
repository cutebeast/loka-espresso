from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, nullable=False)

    store = relationship("Store", back_populates="categories")
    items = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("menu_categories.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    base_price = Column(DECIMAL(10, 2), nullable=False)
    image_url = Column(String(500), nullable=True)
    customization_options = Column(JSON, nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0)
    popularity = Column(Integer, default=0)
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete

    store = relationship("Store", back_populates="items")
    category = relationship("MenuCategory", back_populates="items")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    current_stock = Column(DECIMAL(10, 2), default=0)
    unit = Column(String(50), nullable=True)
    reorder_level = Column(DECIMAL(10, 2), default=0)
    cost_per_unit = Column(DECIMAL(10, 2), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    store = relationship("Store", back_populates="inventory_items")
