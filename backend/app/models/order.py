from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Enum, Text, Integer, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models import OrderItem, OrderStatusHistory, Payment, MenuItem


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
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    customizations: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    customization_option_ids: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    unit_price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    table_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("store_tables.id"), nullable=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType), nullable=False)
    items: Mapped[dict] = mapped_column(JSON, nullable=False)
    subtotal: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    # Single discount at checkout (voucher OR reward, not both):
    # - voucher_discount: from voucher use
    # - reward_discount: from reward redemption
    # loyalty_discount field kept for DB compatibility but always 0
    voucher_discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    reward_discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    loyalty_discount: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    status_history: Mapped[List["OrderStatusHistory"]] = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="order", uselist=False)
    order_items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    menu_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    customizations: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    line_total: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order: Mapped["Order"] = relationship("Order", back_populates="order_items")
    menu_item: Mapped[Optional["MenuItem"]] = relationship("MenuItem")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order: Mapped[Order] = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, unique=True)
    method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    transaction_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order: Mapped[Order] = relationship("Order", back_populates="payment")
