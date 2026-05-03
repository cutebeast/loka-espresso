from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey, DECIMAL, JSON, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.customer import Customer


class Allergen(Base):
    __tablename__ = "allergens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    menu_items: Mapped[List["MenuItem"]] = relationship("MenuItem", secondary="menu_item_allergens", back_populates="allergens")
    menu_item_allergen_associations: Mapped[List["MenuItemAllergen"]] = relationship("MenuItemAllergen", back_populates="allergen", cascade="all, delete-orphan")


class MenuItemAllergen(Base):
    __tablename__ = "menu_item_allergens"

    menu_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), primary_key=True)
    allergen_id: Mapped[int] = mapped_column(Integer, ForeignKey("allergens.id", ondelete="CASCADE"), primary_key=True)

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="menu_item_allergen_associations")
    allergen: Mapped["Allergen"] = relationship("Allergen", back_populates="menu_item_allergen_associations")


class DeliveryZone(Base):
    __tablename__ = "delivery_zones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    zone_type: Mapped[str] = mapped_column(String(50), default="radius", nullable=False)
    delivery_fee: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0, nullable=False)
    min_order: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0, nullable=False)
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store: Mapped["Store"] = relationship("Store", back_populates="delivery_zones")


class TaxRate(Base):
    __tablename__ = "tax_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    rate: Mapped[float] = mapped_column(DECIMAL(5, 4), nullable=False)
    tax_type: Mapped[str] = mapped_column(String(50), default="percentage", nullable=False)
    is_inclusive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    store_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store: Mapped[Optional["Store"]] = relationship("Store", back_populates="tax_rates")


class ModifierGroup(Base):
    __tablename__ = "modifier_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menu_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_selections: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="modifier_groups")
    options: Mapped[List["ModifierOption"]] = relationship("ModifierOption", back_populates="group", cascade="all, delete-orphan")


class ModifierOption(Base):
    __tablename__ = "modifier_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("modifier_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_adjustment: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    group: Mapped["ModifierGroup"] = relationship("ModifierGroup", back_populates="options")


class TaxCategory(Base):
    __tablename__ = "tax_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tax_rate_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    tax_rate: Mapped[Optional["TaxRate"]] = relationship("TaxRate")


class RecipeItem(Base):
    __tablename__ = "recipe_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menu_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(DECIMAL(10, 4), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    menu_item: Mapped["MenuItem"] = relationship("MenuItem")
    inventory_item: Mapped["InventoryItem"] = relationship("InventoryItem")


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    table_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("store_tables.id", ondelete="SET NULL"), nullable=True)
    guest_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    reserved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    store: Mapped["Store"] = relationship("Store", back_populates="reservations")
    user: Mapped[Optional["Customer"]] = relationship("Customer", foreign_keys=[user_id])
    table: Mapped[Optional["StoreTable"]] = relationship("StoreTable")
