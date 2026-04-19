from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, DECIMAL, JSON, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base


class MovementType(str, enum.Enum):
    received = "received"
    waste = "waste"
    transfer_out = "transfer_out"
    transfer_in = "transfer_in"
    cycle_count = "cycle_count"
    adjustment = "adjustment"


class InventoryCategory(Base):
    __tablename__ = "inventory_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    store: Mapped[Store] = relationship("Store")
    items: Mapped[List[InventoryItem]] = relationship("InventoryItem", back_populates="inventory_category")


class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    store: Mapped[Store] = relationship("Store", back_populates="categories")
    items: Mapped[List[MenuItem]] = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_categories.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    base_price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    customization_options: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    store: Mapped[Store] = relationship("Store", back_populates="items")
    category: Mapped[MenuCategory] = relationship("MenuCategory", back_populates="items")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    current_stock: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reorder_level: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    category_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("inventory_categories.id"), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    store: Mapped[Store] = relationship("Store", back_populates="inventory_items")
    movements: Mapped[List[InventoryMovement]] = relationship("InventoryMovement", back_populates="inventory_item")
    inventory_category: Mapped[Optional[InventoryCategory]] = relationship("InventoryCategory", back_populates="items")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    inventory_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    movement_type: Mapped[MovementType] = mapped_column(Enum(MovementType, name="movement_type"), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    balance_after: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store: Mapped[Store] = relationship("Store")
    inventory_item: Mapped[InventoryItem] = relationship("InventoryItem", back_populates="movements")
    user: Mapped[User] = relationship("User")
