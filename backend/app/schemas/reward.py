from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RewardOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    points_cost: int
    reward_type: str
    item_id: Optional[int] = None
    discount_value: Optional[float] = None
    min_spend: Optional[float] = 0
    image_url: Optional[str] = None
    stock_limit: Optional[int] = None
    total_redeemed: int = 0
    is_active: bool = True
    code: Optional[str] = None
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    validity_days: Optional[int] = 30

    class Config:
        from_attributes = True


class RewardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    points_cost: int
    reward_type: str = "custom"
    item_id: Optional[int] = None
    discount_value: Optional[float] = None
    min_spend: Optional[float] = 0
    image_url: Optional[str] = None
    stock_limit: Optional[int] = None
    code: Optional[str] = None
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    validity_days: Optional[int] = 30


class RewardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    points_cost: Optional[int] = None
    reward_type: Optional[str] = None
    item_id: Optional[int] = None
    discount_value: Optional[float] = None
    min_spend: Optional[float] = None
    image_url: Optional[str] = None
    stock_limit: Optional[int] = None
    is_active: Optional[bool] = None
    code: Optional[str] = None
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    validity_days: Optional[int] = None
