from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CartItemCreate(BaseModel):
    item_id: int
    store_id: int
    quantity: int = 1
    customization_option_ids: Optional[list[int]] = None
    customizations: Optional[dict] = None


class CartItemUpdate(BaseModel):
    quantity: Optional[int] = None
    customization_option_ids: Optional[list[int]] = None
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
