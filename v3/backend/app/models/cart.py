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


# Legacy — CheckoutSession only used in customer PWA flow, not admin
