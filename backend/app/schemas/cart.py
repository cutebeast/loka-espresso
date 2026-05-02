from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class CartItemCreate(BaseModel):
    item_id: int
    quantity: int = 1
    customization_option_ids: Optional[list[int]] = None
    store_id: Optional[int] = None

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v < 1:
            raise ValueError('quantity must be >= 1')
        if v > 99:
            raise ValueError('quantity must be <= 99')
        return v


class CartItemUpdate(BaseModel):
    quantity: Optional[int] = None
    customization_option_ids: Optional[list[int]] = None

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError('quantity must be >= 1')
        if v is not None and v > 99:
            raise ValueError('quantity must be <= 99')
        return v
    customizations: Optional[dict] = None


class CartItemOut(BaseModel):
    id: int
    user_id: int
    item_id: int
    quantity: int
    customizations: Optional[dict] = None
    customization_option_ids: Optional[list[int]] = None
    unit_price: float
    item_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CartOut(BaseModel):
    items: list[CartItemOut] = []
    subtotal: float = 0
