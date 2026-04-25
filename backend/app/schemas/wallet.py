from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class WalletOut(BaseModel):
    id: int
    user_id: int
    balance: float
    currency: str = "MYR"

    class Config:
        from_attributes = True


class WalletTopup(BaseModel):
    amount: float
    user_id: Optional[int] = None
    description: Optional[str] = None

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be positive')
        if v > 10000:
            raise ValueError('amount must be <= 10000')
        return v


class WalletDeduct(BaseModel):
    amount: float
    user_id: int
    description: str = "Wallet deduction"

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be positive')
        if v > 10000:
            raise ValueError('amount must be <= 10000')
        return v


class WalletTransactionOut(BaseModel):
    id: int
    amount: float
    type: str
    description: Optional[str] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
