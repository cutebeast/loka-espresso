import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class MovementType(str, enum.Enum):
    received = "received"
    waste = "waste"
    transfer_out = "transfer_out"
    transfer_in = "transfer_in"
    cycle_count = "cycle_count"
    adjustment = "adjustment"


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
    deleted_at = Column(DateTime(timezone=True), nullable=True)

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
    is_active = Column(Boolean, default=True, nullable=False)
    category = Column(String(100), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    store = relationship("Store", back_populates="inventory_items")
    movements = relationship("InventoryMovement", back_populates="inventory_item")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    movement_type = Column(Enum(MovementType, name="movement_type"), nullable=False)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    balance_after = Column(DECIMAL(10, 2), nullable=False)
    note = Column(Text, nullable=False)
    attachment_path = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store = relationship("Store")
    inventory_item = relationship("InventoryItem", back_populates="movements")
    user = relationship("User")
