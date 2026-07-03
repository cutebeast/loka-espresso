"""Payment Processing models."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import BYTEA, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import PaymentMethodType, PaymentProvider, PaymentStatus


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    payment_method_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True, index=True
    )
    provider: Mapped[str] = mapped_column(PaymentProvider, nullable=False)
    provider_transaction_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_reference_encrypted: Mapped[bytes | None] = mapped_column(BYTEA, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    payment_method_type: Mapped[str] = mapped_column(PaymentMethodType, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    currency_code: Mapped[str] = mapped_column(CHAR(3), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(PaymentStatus, nullable=False, default="initiated")
    captured_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    refunded_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    refund_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    failure_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    settlement_batch_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)

    events: Mapped[List["PaymentEvent"]] = relationship(
        "PaymentEvent", back_populates="payment", cascade="all, delete-orphan"
    )
    order: Mapped["Order"] = relationship("Order", back_populates="payments")
    payment_method: Mapped["PaymentMethod | None"] = relationship("PaymentMethod", back_populates="payments")
    refund_records: Mapped[List["Refund"]] = relationship(
        "Refund", back_populates="payment"
    )

    __table_args__ = (
        CheckConstraint(
            "provider IN ('stripe','adyen','braintree','paypal','cash','store_credit','internal_wallet','grabpay','gcash','alipay','wechat_pay','hitpay')",
            name="ck_payments_provider",
        ),
        CheckConstraint(
            "payment_method_type IN ('credit_card','debit_card','e_wallet','bank_transfer','cash','crypto','buy_now_pay_later','qr_pay')",
            name="ck_payments_payment_method_type",
        ),
        CheckConstraint("amount > 0", name="ck_payments_amount"),
        CheckConstraint("captured_amount >= 0", name="ck_payments_captured_amount"),
        CheckConstraint("refunded_amount >= 0 AND refunded_amount <= captured_amount", name="ck_payments_refunded_amount"),
        CheckConstraint("refund_count >= 0", name="ck_payments_refund_count"),
        CheckConstraint("fee_amount >= 0", name="ck_payments_fee_amount"),
        CheckConstraint("net_amount >= 0", name="ck_payments_net_amount"),
    )


class PaymentEvent(Base, TimestampMixin):
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(PaymentStatus, nullable=True)
    to_status: Mapped[str] = mapped_column(PaymentStatus, nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    provider_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    payment: Mapped["Payment"] = relationship("Payment", back_populates="events")

    __table_args__ = (
        CheckConstraint(
            "from_status IN ('initiated','pending_authorization','authorized','captured','failed','refunded','partially_refunded','chargeback','voided','settled')",
            name="ck_payment_events_from_status",
        ),
        CheckConstraint(
            "to_status IN ('initiated','pending_authorization','authorized','captured','failed','refunded','partially_refunded','chargeback','voided','settled')",
            name="ck_payment_events_to_status",
        ),
    )


class PaymentMethod(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    method_type: Mapped[str] = mapped_column(PaymentMethodType, nullable=False)
    provider: Mapped[str] = mapped_column(PaymentProvider, nullable=False)
    display_label: Mapped[str] = mapped_column(String(100), nullable=False)
    card_brand: Mapped[str | None] = mapped_column(String(20), nullable=True)
    card_last_four: Mapped[str | None] = mapped_column(CHAR(4), nullable=True)
    card_expiry_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    card_expiry_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    provider_token_encrypted: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    provider_token_iv: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_address_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="payment_methods")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="payment_method")

    __table_args__ = (
        CheckConstraint(
            "method_type IN ('credit_card','debit_card','e_wallet','bank_transfer','cash','crypto','buy_now_pay_later','qr_pay')",
            name="ck_payment_methods_method_type",
        ),
        CheckConstraint(
            "provider IN ('stripe','adyen','braintree','paypal','cash','store_credit','internal_wallet','grabpay','gcash','alipay','wechat_pay','hitpay')",
            name="ck_payment_methods_provider",
        ),
        CheckConstraint("card_last_four ~ '^[0-9]{4}$'", name="ck_payment_methods_card_last_four"),
        CheckConstraint("card_expiry_month BETWEEN 1 AND 12", name="ck_payment_methods_card_expiry_month"),
        CheckConstraint("card_expiry_year BETWEEN extract(year from now()) AND 2100", name="ck_payment_methods_card_expiry_year"),
    )


class Refund(Base, TimestampMixin):
    __tablename__ = "refunds"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    reason_category: Mapped[str] = mapped_column(String(50), nullable=False)
    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    provider_refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    payment: Mapped["Payment"] = relationship("Payment", back_populates="refund_records")
    order: Mapped["Order"] = relationship("Order", back_populates="refunds")
    approver: Mapped["AdminAccount"] = relationship("AdminAccount")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_refunds_amount"),
        CheckConstraint(
            "reason_category IN ('customer_request','item_unavailable','quality_issue','wrong_order','late_delivery','other')",
            name="ck_refunds_reason_category",
        ),
        CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="ck_refunds_status",
        ),
    )
