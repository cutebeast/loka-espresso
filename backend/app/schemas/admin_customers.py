from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CustomerOut(BaseModel):
    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tier: Optional[str] = None
    points_balance: Optional[int] = 0
    total_orders: int = 0
    total_spent: float = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomerDetailOut(BaseModel):
    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    tier: Optional[str] = None
    points_balance: int = 0
    total_points_earned: int = 0
    total_orders: int = 0
    total_spent: float = 0
    wallet_balance: float = 0
    created_at: Optional[datetime] = None
    recent_orders: list = []

    class Config:
        from_attributes = True


class AdjustPointsRequest(BaseModel):
    points: int
    reason: Optional[str] = None


class SetTierRequest(BaseModel):
    tier: str
    reason: Optional[str] = None


class AwardVoucherRequest(BaseModel):
    voucher_id: int
    reason: Optional[str] = None


class CustomerUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
