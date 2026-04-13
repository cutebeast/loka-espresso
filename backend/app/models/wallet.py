import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, DECIMAL, Text
from app.core.database import Base


class WalletTxType(str, enum.Enum):
    topup = "topup"
    payment = "payment"
    refund = "refund"


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    balance = Column(DECIMAL(10, 2), default=0, nullable=False)
    currency = Column(String(10), default="MYR", nullable=False)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    amount = Column(DECIMAL(10, 2), nullable=False)
    type = Column(Enum(WalletTxType), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=True)
    provider = Column(String(50), nullable=True)
    last4 = Column(String(4), nullable=True)
    is_default = Column(Integer, default=0)
