import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, Text, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class OrderType(str, enum.Enum):
    dine_in = "dine_in"
    pickup = "pickup"
    delivery = "delivery"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    preparing = "preparing"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    customizations = Column(JSON, nullable=True)
    unit_price = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("store_tables.id"), nullable=True)
    order_number = Column(String(50), unique=True, nullable=False, index=True)
    order_type = Column(Enum(OrderType), nullable=False)
    items = Column(JSON, nullable=False)  # Kept as JSON for backwards compat; also stored in order_items
    subtotal = Column(DECIMAL(10, 2), nullable=False)
    delivery_fee = Column(DECIMAL(10, 2), default=0)
    discount = Column(DECIMAL(10, 2), default=0)
    total = Column(DECIMAL(10, 2), nullable=False)
    status = Column(Enum(OrderStatus), default=OrderStatus.pending, nullable=False)
    pickup_time = Column(DateTime(timezone=True), nullable=True)
    delivery_address = Column(JSON, nullable=True)
    payment_method = Column(String(50), nullable=True)
    payment_status = Column(String(50), default="pending")
    loyalty_points_earned = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)
    order_items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    menu_item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(DECIMAL(10, 2), nullable=False)
    customizations = Column(JSON, nullable=True)
    line_total = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    order = relationship("Order", back_populates="order_items")
    menu_item = relationship("MenuItem")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    status = Column(Enum(OrderStatus), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    order = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, unique=True)
    method = Column(String(50), nullable=True)
    amount = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(50), default="pending")
    transaction_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.utcnow())

    order = relationship("Order", back_populates="payment")
