from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Enum, Text, Integer, ForeignKey, DECIMAL, JSON, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models import OrderItem, OrderStatusHistory, Payment, MenuItem
    from app.models.user import User
    from app.models.store import Store
    from app.models.menu import MenuItem


class OrderType(str, enum.Enum):
    dine_in = "dine_in"
    pickup = "pickup"
    delivery = "delivery"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    confirmed = "confirmed"
    preparing = "preparing"
    ready = "ready"
    out_for_delivery = "out_for_delivery"
    completed = "completed"
    cancelled = "cancelled"


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    customization_option_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    customization_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    unit_price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_cart_item_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_cart_item_unit_price_nonnegative"),
        Index("ix_cart_item_user_store", "user_id", "store_id"),
        UniqueConstraint("user_id", "store_id", "item_id", "customization_hash", name="uq_cart_item_identity"),
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    store: Mapped["Store"] = relationship("Store", foreign_keys=[store_id])
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", foreign_keys=[item_id])


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("store_tables.id", ondelete="SET NULL"), nullable=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType), nullable=False)
    items: Mapped[dict] = mapped_column(JSON, nullable=False)
    subtotal: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    voucher_discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    reward_discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    voucher_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reward_redemption_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    total: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.pending, nullable=False)
    pickup_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_address: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(50), default="pending")
    loyalty_points_earned: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_quote_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_tracking_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    delivery_eta_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    delivery_courier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_courier_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    delivery_last_event_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pos_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pos_synced_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    delivery_dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_dispatched_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    staff_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="ck_orders_subtotal"),
        CheckConstraint("total >= 0", name="ck_orders_total"),
        CheckConstraint("delivery_fee >= 0", name="ck_orders_delivery_fee"),
        CheckConstraint("discount >= 0", name="ck_orders_discount"),
        Index("ix_orders_store_status_created", "store_id", "status", "created_at"),
        Index("ix_orders_user_created", "user_id", "created_at"),
        Index("ix_orders_store_created", "store_id", "created_at"),
    )

    status_history: Mapped[List["OrderStatusHistory"]] = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="order", uselist=False)
    order_items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    customizations: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    line_total: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_order_items_unit_price_nonnegative"),
        CheckConstraint("line_total >= 0", name="ck_order_items_line_total_nonnegative"),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_order_menu", "order_id", "menu_item_id"),
    )

    order: Mapped["Order"] = relationship("Order", back_populates="order_items")
    menu_item: Mapped[Optional["MenuItem"]] = relationship("MenuItem")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order: Mapped[Order] = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True)
    method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    transaction_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    settled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_payments_amount"),
        Index("ix_payments_order_status", "order_id", "status"),
    )

    order: Mapped[Order] = relationship("Order", back_populates="payment")


class CheckoutToken(Base):
    """Temporary checkout token with discount details.
    Created by POST /checkout, validated by POST /orders.
    Expires after 15 minutes."""
    __tablename__ = "checkout_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    voucher_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reward_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    discount_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    discount_amount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    subtotal: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    total: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    is_used: Mapped[bool] = mapped_column(default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    store: Mapped["Store"] = relationship("Store", foreign_keys=[store_id])
