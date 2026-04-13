from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class VoucherOut(BaseModel):
    id: int
    code: str
    description: Optional[str] = None
    discount_type: str
    discount_value: float
    min_order: float = 0
    max_uses: Optional[int] = None
    used_count: int = 0
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class VoucherCreate(BaseModel):
    code: str
    description: Optional[str] = None
    discount_type: str = "percent"
    discount_value: float
    min_order: float = 0
    max_uses: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None


class VoucherUpdate(BaseModel):
    code: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    min_order: Optional[float] = None
    max_uses: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None


class VoucherValidate(BaseModel):
    code: str
    order_total: Optional[float] = None


class VoucherApply(BaseModel):
    code: str
    order_id: Optional[int] = None
