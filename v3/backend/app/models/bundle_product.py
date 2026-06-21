"""Bundle product (combo meal) models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text
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
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_per_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    image_gallery_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    gallery_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pick_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    allow_duplicates: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    components: Mapped[List["BundleProductComponent"]] = relationship(
        "BundleProductComponent", back_populates="bundle_product", cascade="all, delete-orphan"
    )
    groups: Mapped[List["BundleGroup"]] = relationship(
        "BundleGroup", back_populates="bundle_product", cascade="all, delete-orphan"
    )


class BundleGroup(Base):
    __tablename__ = "bundle_groups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bundle_product_id: Mapped[int] = mapped_column(
        ForeignKey("bundle_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_label: Mapped[str] = mapped_column(String(100), nullable=False)
    group_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    pick_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    min_pick: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_pick: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )

    bundle_product: Mapped["BundleProduct"] = relationship("BundleProduct", back_populates="groups")
    components: Mapped[List["BundleProductComponent"]] = relationship(
        "BundleProductComponent", back_populates="bundle_group", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("pick_count > 0", name="ck_bundle_groups_pick_count"),
        CheckConstraint("min_pick >= 0", name="ck_bundle_groups_min_pick"),
        CheckConstraint("max_pick >= min_pick", name="ck_bundle_groups_max_pick"),
    )


class BundleProductComponent(Base):
    __tablename__ = "bundle_product_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bundle_product_id: Mapped[int] = mapped_column(
        ForeignKey("bundle_products.id", ondelete="CASCADE"), nullable=False
    )
    bundle_group_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("bundle_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False
    )
    default_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    bundle_product: Mapped["BundleProduct"] = relationship("BundleProduct", back_populates="components")
    bundle_group: Mapped["BundleGroup | None"] = relationship("BundleGroup", back_populates="components")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", foreign_keys=[menu_item_id])

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
