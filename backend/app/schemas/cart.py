from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class CartItemCreate(BaseModel):
    item_id: int
    store_id: int
    quantity: int = 1
    customization_option_ids: Optional[list[int]] = None

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v < 1:
            raise ValueError('quantity must be >= 1')
        if v > 99:
            raise ValueError('quantity must be <= 99')
        return v

    @field_validator('store_id')
    @classmethod
    def store_id_valid(cls, v):
        if v < 0:
            raise ValueError('store_id must be non-negative')
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
    store_id: int
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
    store_id: int
    store_name: Optional[str] = None
    items: list[CartItemOut] = []
    subtotal: float = 0
