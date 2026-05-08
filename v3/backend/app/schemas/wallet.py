"""Wallet domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class WalletBase(BaseSchema):
    pass


class WalletOut(BaseSchema):
    id: int
    customer_id: int
    balance: float = 0.0
    currency_code: str
    is_frozen: bool
    freeze_reason: str | None = None
    total_credited: float = 0.0
    total_debited: float = 0.0
    created_at: datetime
    updated_at: datetime


class WalletLedgerEntryBase(BaseSchema):
    amount: float
    entry_type: Literal["credit", "debit", "refund", "reversal", "adjustment", "promo_bonus"]
    reference_type: Literal["order", "refund", "top_up", "withdrawal", "promotion", "referral", "adjustment", "loyalty_redemption"] = "order"
    reference_id: int | None = None
    description: str | None = Field(None, max_length=255)
    expires_at: datetime | None = None


class WalletLedgerEntryOut(WalletLedgerEntryBase):
    id: int
    wallet_id: int
    running_balance: float
    created_by: int | None = None
    created_at: datetime


class TopUpRequest(BaseSchema):
    amount: float = Field(..., gt=0)
    payment_method_id: int
    return_url: str | None = Field(None, max_length=500)
