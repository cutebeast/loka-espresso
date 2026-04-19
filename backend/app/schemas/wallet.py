from pydantic import BaseModel
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
    description: Optional[str] = None
    created_at: Optional[datetime] = None


class WalletTransactionOut(BaseModel):
    id: int
    amount: float
    type: str
    description: Optional[str] = None
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
