"""Cart & Checkout models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CustomerCart(Base, TimestampMixin):
    __tablename__ = "customer_carts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    line_items: Mapped[List["CartLineItem"]] = relationship(
        "CartLineItem", back_populates="cart", cascade="all, delete-orphan"
    )
    customer: Mapped["Customer"] = relationship("Customer", back_populates="carts")
    store: Mapped["Store"] = relationship("Store", back_populates="carts")

    __table_args__ = (
        UniqueConstraint("customer_id", "store_id"),
        CheckConstraint("item_count >= 0", name="ck_customer_carts_item_count"),
        CheckConstraint("subtotal >= 0", name="ck_customer_carts_subtotal"),
    )


class CartLineItem(Base):
    __tablename__ = "cart_line_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cart_id: Mapped[int] = mapped_column(
        ForeignKey("customer_carts.id", ondelete="CASCADE"), nullable=False
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )
    menu_variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_variants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    selected_modifiers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    modifier_total: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    special_instructions: Mapped[str | None] = mapped_column(String(255), nullable=True)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    cart: Mapped["CustomerCart"] = relationship("CustomerCart", back_populates="line_items")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem")
    menu_variant: Mapped["MenuVariant"] = relationship("MenuVariant")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_cart_line_items_quantity"),
        CheckConstraint("unit_price >= 0", name="ck_cart_line_items_unit_price"),
        CheckConstraint("line_total >= 0", name="ck_cart_line_items_line_total"),
    )


class CheckoutSession(Base):
    __tablename__ = "checkout_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False
    )
    cart_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    applied_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="SET NULL"), nullable=True
    )
    applied_reward_id: Mapped[int | None] = mapped_column(
        ForeignKey("reward_catalog.id", ondelete="SET NULL"), nullable=True
    )
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    delivery_fee: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip_address: Mapped[str] = mapped_column(INET, nullable=False)
    device_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    customer: Mapped["Customer"] = relationship("Customer")
    store: Mapped["Store"] = relationship("Store")
    applied_voucher: Mapped["VoucherDefinition | None"] = relationship("VoucherDefinition")
    applied_reward: Mapped["RewardCatalog | None"] = relationship("RewardCatalog")
    completed_order: Mapped["Order | None"] = relationship("Order")

    __table_args__ = (
        CheckConstraint("discount_amount >= 0", name="ck_checkout_sessions_discount_amount"),
        CheckConstraint("delivery_fee >= 0", name="ck_checkout_sessions_delivery_fee"),
        CheckConstraint("tax_amount >= 0", name="ck_checkout_sessions_tax_amount"),
        CheckConstraint("subtotal >= 0", name="ck_checkout_sessions_subtotal"),
        CheckConstraint("total_amount >= 0", name="ck_checkout_sessions_total_amount"),
        CheckConstraint("expires_at > created_at", name="ck_checkout_sessions_expires_at"),
    )
