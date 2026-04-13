from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LoyaltyBalanceOut(BaseModel):
    points_balance: int
    tier: str
    total_points_earned: int

    class Config:
        from_attributes = True


class LoyaltyTransactionOut(BaseModel):
    id: int
    points: int
    type: str
    order_id: Optional[int] = None
    store_id: Optional[int] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoyaltyTierOut(BaseModel):
    id: int
    name: str
    min_points: int
    benefits: Optional[dict] = None

    class Config:
        from_attributes = True
