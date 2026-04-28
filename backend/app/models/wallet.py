from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, Enum, Text, Integer, ForeignKey, DECIMAL, Boolean, Index, CheckConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.customer import Customer


class WalletTxType(str, enum.Enum):
    topup = "topup"
    payment = "payment"
    refund = "refund"
    promo_credit = "promo_credit"
    admin_adjustment = "admin_adjustment"


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    balance: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="MYR", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("balance >= 0", name="ck_wallets_balance"),
    )

    user: Mapped["Customer"] = relationship("Customer", foreign_keys=[user_id])


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    wallet_id: Mapped[int] = mapped_column(Integer, ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    type: Mapped[WalletTxType] = mapped_column(Enum(WalletTxType), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    balance_after: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_wallet_transactions_amount_nonnegative"),
        Index("ix_wallet_tx_wallet_type", "wallet_id", "type"),
        Index("ix_wallet_tx_wallet_created", "wallet_id", "created_at"),
    )

    wallet: Mapped["Wallet"] = relationship("Wallet", foreign_keys=[wallet_id])


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last4: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["Customer"] = relationship("Customer", foreign_keys=[user_id])
