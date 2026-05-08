"""Voucher models."""

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
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import VoucherScope, VoucherType


class VoucherDefinition(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "voucher_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voucher_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    voucher_type: Mapped[str] = mapped_column(VoucherType, nullable=False)
    scope: Mapped[str] = mapped_column(VoucherScope, nullable=False, default="global")
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    menu_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    display_title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    discount_value: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    discount_max_amount: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    minimum_order_value: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    maximum_discount: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    max_global_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_uses_per_customer: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    global_use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    customer_segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    first_order_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stackable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    terms_and_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    store: Mapped["Store"] = relationship("Store", back_populates="voucher_definitions")
    customer_vouchers: Mapped[List["CustomerVoucher"]] = relationship(
        "CustomerVoucher",
        back_populates="voucher_definition",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "voucher_type IN ('percentage_off','fixed_amount_off','free_delivery','free_item','bundle_offer','referral_reward','loyalty_exclusive')",
            name="ck_voucher_definitions_voucher_type",
        ),
        CheckConstraint(
            "scope IN ('global','store_specific','category_specific','item_specific','customer_segment')",
            name="ck_voucher_definitions_scope",
        ),
        CheckConstraint("discount_value >= 0", name="ck_voucher_definitions_discount_value"),
        CheckConstraint("minimum_order_value >= 0", name="ck_voucher_definitions_minimum_order_value"),
        CheckConstraint("max_global_uses > 0", name="ck_voucher_definitions_max_global_uses"),
        CheckConstraint("max_uses_per_customer > 0", name="ck_voucher_definitions_max_uses_per_customer"),
        CheckConstraint("global_use_count >= 0", name="ck_voucher_definitions_global_use_count"),
        CheckConstraint("valid_until > valid_from", name="ck_voucher_definitions_valid_until"),
    )


class CustomerVoucher(Base):
    __tablename__ = "customer_vouchers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    voucher_definition_id: Mapped[int] = mapped_column(
        ForeignKey("voucher_definitions.id", ondelete="CASCADE"), nullable=False
    )
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    voucher_code: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    voucher_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reserved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="customer_vouchers")
    voucher_definition: Mapped["VoucherDefinition"] = relationship(
        "VoucherDefinition", back_populates="customer_vouchers"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','reserved','used','expired','revoked')",
            name="ck_customer_vouchers_status",
        ),
        CheckConstraint("use_count >= 0", name="ck_customer_vouchers_use_count"),
    )
