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
    points_multiplier: Optional[float] = 1.0
    benefits: Optional[dict] = None
    sort_order: int = 0

    class Config:
        from_attributes = True
