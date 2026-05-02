from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MenuCategoryOut(BaseModel):
    id: int
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
    is_active: Optional[bool] = None


class MenuItemOut(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str] = None
    base_price: float
    image_url: Optional[str] = None
    is_available: bool = True
    is_featured: bool = False
    display_order: int = 0
    dietary_tags: Optional[list] = None
    customization_count: int = 0

    class Config:
        from_attributes = True


class MenuItemCreate(BaseModel):
    name: str
    category_id: int
    description: Optional[str] = None
    base_price: float
    image_url: Optional[str] = None
    is_available: bool = True
    is_featured: bool = False
    display_order: int = 0
    dietary_tags: Optional[list] = None


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    base_price: Optional[float] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    is_featured: Optional[bool] = None
    display_order: Optional[int] = None
    dietary_tags: Optional[list] = None


class InventoryCategoryOut(BaseModel):
    id: int
    store_id: int
    name: str
    slug: Optional[str] = None
    display_order: int = 0
    is_active: bool = True

    class Config:
        from_attributes = True


class InventoryCategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    display_order: int = 0
    is_active: Optional[bool] = None


class InventoryItemOut(BaseModel):
    id: int
    store_id: int
    name: str
    current_stock: float
    unit: Optional[str] = None
    reorder_level: float
    is_active: bool = True
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class InventoryItemCreate(BaseModel):
    name: str
    current_stock: float = 0
    unit: Optional[str] = None
    reorder_level: float = 0
    category_id: Optional[int] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    current_stock: Optional[float] = None
    unit: Optional[str] = None
    reorder_level: Optional[float] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class InventoryAdjustRequest(BaseModel):
    movement_type: str  # received, waste, transfer_out, transfer_in, cycle_count, adjustment
    quantity: float  # always positive
    note: str
    attachment_path: Optional[str] = None


class InventoryMovementOut(BaseModel):
    id: int
    store_id: int
    inventory_item_id: int
    inventory_item_name: Optional[str] = None
    movement_type: str
    quantity: float
    balance_after: float
    note: str
    attachment_path: Optional[str] = None
    created_by: int
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class CustomizationCreate(BaseModel):
    name: str
    option_type: str = ""
    price_adjustment: float = 0
    display_order: int = 0


class CustomizationUpdate(BaseModel):
    name: Optional[str] = None
    option_type: Optional[str] = None
    price_adjustment: Optional[float] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
