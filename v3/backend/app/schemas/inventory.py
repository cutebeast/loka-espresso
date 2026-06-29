"""Inventory domain schemas."""

from pydantic import ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class InventoryCategoryBase(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    category_name: str
    slug: str = ""
    description: str | None = None
    is_active: bool = True
    parent_category_id: int | None = None
    display_order: int = 0


class InventoryCategoryCreate(InventoryCategoryBase):
    pass


class InventoryCategoryUpdate(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    category_name: str | None = None
    slug: str | None = None
    description: str | None = None
    is_active: bool | None = None
    parent_category_id: int | None = None
    display_order: int | None = None


class InventoryCategoryOut(InventoryCategoryBase, TimestampedSchema):
    id: int


class InventoryItemBase(BaseSchema):
    category_id: int | None = None
    item_code: str
    item_name: str
    description: str | None = None
    unit_of_measure: str
    unit_cost: float | None = None
    shelf_life_days: int | None = None
    supplier_id: int | None = None
    item_type: str = "fnb"
    is_active: bool = True
    is_direct_sale: bool = False


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseSchema):
    category_id: int | None = None
    item_code: str | None = None
    item_name: str | None = None
    description: str | None = None
    unit_of_measure: str | None = None
    unit_cost: float | None = None
    shelf_life_days: int | None = None
    supplier_id: int | None = None
    item_type: str | None = None
    is_active: bool | None = None
    is_direct_sale: bool | None = None


class InventoryStockBase(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    inventory_item_id: int
    store_id: int
    current_stock: float = 0
    reserved_stock: float = 0
    reorder_level: float = 0
    reorder_quantity: float = 0
    par_level: float = 0
    storage_location: str | None = None


class InventoryStockCreate(InventoryStockBase):
    pass


class InventoryStockUpdate(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    current_stock: float | None = None
    reserved_stock: float | None = None
    reorder_level: float | None = None
    reorder_quantity: float | None = None
    par_level: float | None = None
    storage_location: str | None = None


class InventoryStockOut(InventoryStockBase, TimestampedSchema):
    id: int


class InventoryItemOut(InventoryItemBase, TimestampedSchema):
    id: int
    category_name: str | None = None
    supplier_name: str | None = None
    stock: InventoryStockOut | None = None


class SupplierBase(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    store_id: int | None = None
    supplier_name: str
    contact_person: str | None = None
    phone_number: str | None = Field(default=None, validation_alias="phone")
    email_address: str | None = Field(default=None, validation_alias="email")
    address: str | None = None
    lead_time_days: int = 1
    is_active: bool = True


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseSchema):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    store_id: int | None = None
    supplier_name: str | None = None
    contact_person: str | None = None
    phone_number: str | None = Field(default=None, validation_alias="phone")
    email_address: str | None = Field(default=None, validation_alias="email")
    address: str | None = None
    lead_time_days: int | None = None
    is_active: bool | None = None


class SupplierOut(SupplierBase, TimestampedSchema):
    id: int
