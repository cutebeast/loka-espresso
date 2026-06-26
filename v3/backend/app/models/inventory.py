"""Inventory & Supply Chain models."""
from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import InventoryMovementType


class InventoryCategory(Base, TimestampMixin, SoftDeleteMixin):
    """Global inventory category (company-level, not per-store)."""
    __tablename__ = "inventory_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    parent: Mapped["InventoryCategory | None"] = relationship(
        "InventoryCategory", remote_side=[id], foreign_keys=[parent_category_id],
        back_populates="children",
    )
    children: Mapped[List["InventoryCategory"]] = relationship(
        "InventoryCategory", foreign_keys=[parent_category_id], back_populates="parent",
    )
    items: Mapped[List["InventoryItem"]] = relationship(
        "InventoryItem", back_populates="category"
    )


class InventoryItem(Base, SoftDeleteMixin, TimestampMixin):
    """Global inventory master catalog (company-level, no store_id)."""
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True
    )
    item_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    item_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False)
    unit_cost: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_direct_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    item_type: Mapped[str] = mapped_column(String(10), nullable=False, default="fnb")

    category: Mapped["InventoryCategory | None"] = relationship(
        "InventoryCategory", back_populates="items"
    )
    supplier: Mapped["Supplier | None"] = relationship("Supplier", back_populates="supplied_items")
    movement_logs: Mapped[List["InventoryMovementLog"]] = relationship(
        "InventoryMovementLog", back_populates="inventory_item"
    )
    purchase_order_lines: Mapped[List["PurchaseOrderLine"]] = relationship(
        "PurchaseOrderLine", back_populates="inventory_item"
    )
    stock_levels: Mapped[List["InventoryStock"]] = relationship(
        "InventoryStock", back_populates="item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("unit_cost >= 0", name="ck_inventory_items_unit_cost"),
        CheckConstraint("shelf_life_days > 0", name="ck_inventory_items_shelf_life_days"),
        CheckConstraint("item_type IN ('fnb','non_fnb')", name="ck_inventory_items_item_type"),
    )


class InventoryStock(Base, TimestampMixin):
    """Per-store stock levels for global inventory items."""
    __tablename__ = "inventory_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    current_stock: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    reserved_stock: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    reorder_level: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    reorder_quantity: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    par_level: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    storage_location: Mapped[str | None] = mapped_column(String(50), nullable=True)

    item: Mapped["InventoryItem"] = relationship("InventoryItem", back_populates="stock_levels")
    store: Mapped["Store"] = relationship("Store")

    __table_args__ = (
        UniqueConstraint("inventory_item_id", "store_id", name="uq_inventory_stock_item_store"),
        CheckConstraint("current_stock >= 0", name="ck_inventory_stock_current_stock"),
        CheckConstraint("reserved_stock >= 0", name="ck_inventory_stock_reserved_stock"),
        CheckConstraint("reorder_level >= 0", name="ck_inventory_stock_reorder_level"),
        CheckConstraint("reorder_quantity >= 0", name="ck_inventory_stock_reorder_quantity"),
        CheckConstraint("par_level >= 0", name="ck_inventory_stock_par_level"),
    )


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    supplier_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    store: Mapped["Store"] = relationship("Store", back_populates="suppliers")
    purchase_orders: Mapped[List["PurchaseOrder"]] = relationship(
        "PurchaseOrder", back_populates="supplier"
    )
    supplied_items: Mapped[List["InventoryItem"]] = relationship(
        "InventoryItem", back_populates="supplier"
    )

    __table_args__ = (
        CheckConstraint("lead_time_days > 0", name="ck_suppliers_lead_time_days"),
    )


class InventoryMovementLog(Base):
    __tablename__ = "inventory_movement_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )
    movement_type: Mapped[str] = mapped_column(InventoryMovementType, nullable=False)
    quantity_delta: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    stock_after: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    reserved_delta: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    reserved_after: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    unit_cost_at_movement: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    movement_cost: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    performed_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    store: Mapped["Store"] = relationship("Store")
    inventory_item: Mapped["InventoryItem"] = relationship(
        "InventoryItem", back_populates="movement_logs"
    )
    performer: Mapped["AdminAccount | None"] = relationship("AdminAccount")

    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('in','out','adjustment','waste','return','transfer_in','transfer_out')",
            name="ck_inventory_movement_log_movement_type",
        ),
    )


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False
    )
    po_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    total_amount: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    expected_delivery: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_delivery: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=False, index=True
    )

    store: Mapped["Store"] = relationship("Store")
    supplier: Mapped["Supplier"] = relationship("Supplier", back_populates="purchase_orders")
    lines: Mapped[List["PurchaseOrderLine"]] = relationship(
        "PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan"
    )
    creator: Mapped["AdminAccount"] = relationship("AdminAccount")

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','sent','partial','received','cancelled')",
            name="ck_purchase_orders_status",
        ),
    )


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    inventory_item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )
    quantity_ordered: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    quantity_received: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    purchase_order: Mapped["PurchaseOrder"] = relationship(
        "PurchaseOrder", back_populates="lines"
    )
    inventory_item: Mapped["InventoryItem"] = relationship(
        "InventoryItem", back_populates="purchase_order_lines"
    )

    __table_args__ = (
        CheckConstraint("quantity_ordered > 0", name="ck_purchase_order_lines_quantity_ordered"),
        CheckConstraint("quantity_received >= 0", name="ck_purchase_order_lines_quantity_received"),
        CheckConstraint("unit_cost > 0", name="ck_purchase_order_lines_unit_cost"),
    )
