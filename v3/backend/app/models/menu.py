"""Menu domain models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class MenuCategory(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True
    )
    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    parent_category: Mapped["MenuCategory | None"] = relationship(
        "MenuCategory",
        remote_side=[id],
        foreign_keys=[parent_category_id],
        back_populates="subcategories",
    )
    subcategories: Mapped[List["MenuCategory"]] = relationship(
        "MenuCategory",
        foreign_keys=[parent_category_id],
        back_populates="parent_category",
    )
    menu_items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem", back_populates="category"
    )


class MenuItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="CASCADE"), nullable=False
    )
    item_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    item_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_price: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    cost_price: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_popular: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prep_time_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minimum_tier_id: Mapped[int | None] = mapped_column(
        ForeignKey("loyalty_tiers.id", ondelete="SET NULL"), nullable=True
    )
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    tax_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("tax_categories.id", ondelete="SET NULL"), nullable=True
    )
    is_bundle_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_addon_deal_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    addon_discount_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    addon_discount_value: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    eligible_bundle_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    category: Mapped["MenuCategory"] = relationship(
        "MenuCategory", back_populates="menu_items"
    )
    tax_category: Mapped["TaxCategory | None"] = relationship("TaxCategory", back_populates="menu_items")
    modifier_groups: Mapped[List["MenuModifierGroup"]] = relationship(
        "MenuModifierGroup",
        back_populates="menu_item",
        cascade="all, delete-orphan",
    )
    variants: Mapped[List["MenuVariant"]] = relationship(
        "MenuVariant",
        back_populates="parent_item",
        cascade="all, delete-orphan",
    )
    recipes: Mapped[List["MenuItemRecipe"]] = relationship(
        "MenuItemRecipe",
        back_populates="menu_item",
        cascade="all, delete-orphan",
    )
    allergens: Mapped[List["Allergen"]] = relationship(
        "Allergen", secondary="menu_item_allergens", back_populates="menu_items"
    )
    dietary_tag_links: Mapped[List["MenuItemDietaryTag"]] = relationship(
        "MenuItemDietaryTag", back_populates="menu_item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("base_price >= 0", name="ck_menu_items_base_price"),
        CheckConstraint("cost_price >= 0", name="ck_menu_items_cost_price"),
        CheckConstraint("prep_time_minutes BETWEEN 1 AND 120", name="ck_menu_items_prep_time_minutes"),
        CheckConstraint("calories >= 0", name="ck_menu_items_calories"),
    )


class TaxCategory(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tax_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_name: Mapped[str] = mapped_column(String(50), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    menu_items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem", back_populates="tax_category"
    )

    __table_args__ = (
        CheckConstraint("rate >= 0", name="ck_tax_categories_rate"),
    )


class MenuModifierGroup(Base):
    __tablename__ = "menu_modifier_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )
    group_name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    selection_type: Mapped[str] = mapped_column(String(20), nullable=False, default="single")
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    min_selections: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    max_selections: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    menu_item: Mapped["MenuItem"] = relationship(
        "MenuItem", back_populates="modifier_groups"
    )
    options: Mapped[List["MenuModifierOption"]] = relationship(
        "MenuModifierOption",
        back_populates="modifier_group",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "selection_type IN ('single','multiple')",
            name="ck_menu_modifier_groups_selection_type",
        ),
        CheckConstraint("min_selections >= 0", name="ck_menu_modifier_groups_min_selections"),
        CheckConstraint(
            "max_selections >= min_selections",
            name="ck_menu_modifier_groups_max_selections",
        ),
    )


class MenuModifierOption(Base):
    __tablename__ = "menu_modifier_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    modifier_group_id: Mapped[int] = mapped_column(
        ForeignKey("menu_modifier_groups.id", ondelete="CASCADE"), nullable=False
    )
    option_name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_adjustment: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    modifier_group: Mapped["MenuModifierGroup"] = relationship(
        "MenuModifierGroup", back_populates="options"
    )


class MenuVariant(Base):
    __tablename__ = "menu_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )
    variant_name: Mapped[str] = mapped_column(String(100), nullable=False)
    variant_sku: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    price_adjustment: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    parent_item: Mapped["MenuItem"] = relationship(
        "MenuItem", back_populates="variants"
    )
    recipes: Mapped[List["MenuItemRecipe"]] = relationship(
        "MenuItemRecipe",
        back_populates="menu_variant",
        cascade="all, delete-orphan",
    )


class Allergen(Base, SoftDeleteMixin):
    __tablename__ = "allergens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    allergen_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    color_hex: Mapped[str | None] = mapped_column(String(7), nullable=True, default="#22C55E")
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="high")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    menu_items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem", secondary="menu_item_allergens", back_populates="allergens"
    )

    __table_args__ = (
        CheckConstraint(
            "severity IN ('low','medium','high','critical')",
            name="ck_allergens_severity",
        ),
    )


class MenuItemAllergen(Base):
    __tablename__ = "menu_item_allergens"

    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), primary_key=True
    )
    allergen_id: Mapped[int] = mapped_column(
        ForeignKey("allergens.id", ondelete="CASCADE"), primary_key=True
    )


class MenuItemRecipe(Base):
    __tablename__ = "menu_item_recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )
    menu_variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_variants.id", ondelete="CASCADE"), nullable=True
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )
    quantity_required: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False)
    is_primary_component: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    waste_factor: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, default=0.050)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    menu_item: Mapped["MenuItem"] = relationship(
        "MenuItem", back_populates="recipes"
    )
    menu_variant: Mapped["MenuVariant | None"] = relationship(
        "MenuVariant", back_populates="recipes"
    )
    inventory_item: Mapped["InventoryItem"] = relationship("InventoryItem")

    __table_args__ = (
        UniqueConstraint("menu_item_id", "menu_variant_id", "inventory_item_id"),
        CheckConstraint("quantity_required > 0", name="ck_menu_item_recipes_quantity_required"),
        CheckConstraint(
            "waste_factor BETWEEN 0 AND 1",
            name="ck_menu_item_recipes_waste_factor",
        ),
    )


class DietaryTag(Base):
    __tablename__ = "dietary_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tag_key: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    color_hex: Mapped[str | None] = mapped_column(String(7), nullable=True, default="#22C55E")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    menu_items: Mapped[List["MenuItemDietaryTag"]] = relationship("MenuItemDietaryTag", back_populates="dietary_tag")


class MenuItemDietaryTag(Base):
    __tablename__ = "menu_item_dietary_tags"

    menu_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), primary_key=True
    )
    dietary_tag_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dietary_tags.id", ondelete="CASCADE"), primary_key=True
    )

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="dietary_tag_links")
    dietary_tag: Mapped["DietaryTag"] = relationship("DietaryTag", back_populates="menu_items")
