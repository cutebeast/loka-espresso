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
    currency_code: str
    is_frozen: bool
    frozen_at: datetime | None = None
    freeze_reason: str | None = None
    frozen_by: int | None = None
    balance: float = 0.0
    total_credited: float = 0.0
    total_debited: float = 0.0
    created_at: datetime
    updated_at: datetime


class WalletLedgerEntryBase(BaseSchema):
    wallet_id: int
    entry_type: Literal["credit", "debit", "hold", "release", "adjustment"]
    amount: float = Field(..., gt=0)
    reference_type: str | None = Field(None, max_length=50)
    reference_id: int | None = None
    note: str | None = None


class WalletLedgerEntryOut(WalletLedgerEntryBase):
    id: int
    wallet_id: int
    running_balance: float
    created_by: int | None = None
    created_at: datetime


class TopUpRequest(BaseSchema):
    amount: float = Field(..., gt=0)
    payment_method_id: int | None = None
    return_url: str | None = Field(None, max_length=500)


class AdminTopupRequest(BaseSchema):
    customer_id: int = Field(..., gt=0)
    amount: float = Field(..., gt=0)
    reason: str | None = Field(None, max_length=255)
    payment_method_id: int | None = None
