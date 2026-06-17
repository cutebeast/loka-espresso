"""Bundle product (combo meal) models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class BundleProduct(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "bundle_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bundle_type: Mapped[str] = mapped_column(String(30), nullable=False, default="combo")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bundle_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_per_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    components: Mapped[List["BundleProductComponent"]] = relationship(
        "BundleProductComponent", back_populates="bundle_product", cascade="all, delete-orphan"
    )


class BundleProductComponent(Base):
    __tablename__ = "bundle_product_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bundle_product_id: Mapped[int] = mapped_column(
        ForeignKey("bundle_products.id", ondelete="CASCADE"), nullable=False
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False
    )
    default_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_swappable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    swap_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    bundle_product: Mapped["BundleProduct"] = relationship("BundleProduct", back_populates="components")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="bundle_components")

    modifier_overrides: Mapped[List["BundleComponentModifier"]] = relationship(
        "BundleComponentModifier", back_populates="component", cascade="all, delete-orphan"
    )


class BundleComponentModifier(Base):
    __tablename__ = "bundle_component_modifiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bundle_product_component_id: Mapped[int] = mapped_column(
        ForeignKey("bundle_product_components.id", ondelete="CASCADE"), nullable=False
    )
    modifier_option_id: Mapped[int] = mapped_column(
        ForeignKey("menu_modifier_options.id", ondelete="RESTRICT"), nullable=False
    )
    price_adjustment: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    component: Mapped["BundleProductComponent"] = relationship(
        "BundleProductComponent", back_populates="modifier_overrides"
    )
    modifier_option: Mapped["MenuModifierOption"] = relationship("MenuModifierOption")
