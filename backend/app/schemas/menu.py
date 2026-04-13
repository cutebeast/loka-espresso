from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MenuCategoryOut(BaseModel):
    id: int
    store_id: int
    name: str
    slug: Optional[str] = None
    display_order: int = 0
    is_active: bool = True

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    display_order: int = 0


class MenuItemOut(BaseModel):
    id: int
    store_id: int
    category_id: int
    name: str
    description: Optional[str] = None
    base_price: float
    image_url: Optional[str] = None
    customization_options: Optional[dict] = None
    is_available: bool = True
    display_order: int = 0

    class Config:
        from_attributes = True


class MenuItemCreate(BaseModel):
    name: str
    category_id: int
    description: Optional[str] = None
    base_price: float
    image_url: Optional[str] = None
    customization_options: Optional[dict] = None
    is_available: bool = True
    display_order: int = 0


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    base_price: Optional[float] = None
    image_url: Optional[str] = None
    customization_options: Optional[dict] = None
    is_available: Optional[bool] = None
    display_order: Optional[int] = None


class InventoryItemOut(BaseModel):
    id: int
    store_id: int
    name: str
    current_stock: float
    unit: Optional[str] = None
    reorder_level: float
    cost_per_unit: Optional[float] = None

    class Config:
        from_attributes = True


class InventoryItemCreate(BaseModel):
    name: str
    current_stock: float = 0
    unit: Optional[str] = None
    reorder_level: float = 0
    cost_per_unit: Optional[float] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    current_stock: Optional[float] = None
    unit: Optional[str] = None
    reorder_level: Optional[float] = None
    cost_per_unit: Optional[float] = None
