"""Wallet & Ledger models."""

from datetime import datetime, timezone
from typing import List

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Wallet(Base, TimestampMixin):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    currency_code: Mapped[str] = mapped_column(CHAR(3), nullable=False, default="USD")
    is_frozen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    frozen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    freeze_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    frozen_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="wallet")
    ledger_entries: Mapped[List["WalletLedgerEntry"]] = relationship(
        "WalletLedgerEntry",
        back_populates="wallet",
        cascade="all, delete-orphan",
    )


class WalletLedgerEntry(Base):
    __tablename__ = "wallet_ledger_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False
    )
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    running_balance: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    wallet: Mapped["Wallet"] = relationship(
        "Wallet", back_populates="ledger_entries"
    )

    __table_args__ = (
        CheckConstraint(
            "entry_type IN ('credit','debit','hold','release','adjustment')",
            name="ck_wallet_ledger_entries_entry_type",
        ),
    )
