"""Menu domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class AllergenOut(BaseSchema):
    id: int
    allergen_key: str
    display_name: str
    description: str | None
    icon_url: str | None
    color_hex: str | None = None
    severity: Literal["low", "medium", "high", "critical"] = "high"
    is_active: bool
    created_at: datetime | None = None


class MenuCategoryBase(BaseSchema):
    category_name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., max_length=50)
    description: str | None = Field(None, max_length=500)
    display_order: int = Field(default=0, ge=0)
    image_url: str | None = Field(None, max_length=500)
    is_available: bool = True
    is_featured: bool = False


class MenuCategoryCreate(MenuCategoryBase):
    parent_category_id: int | None = None


class MenuCategoryUpdate(BaseSchema):
    category_name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, max_length=50)
    description: str | None = Field(None, max_length=500)
    display_order: int | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=500)
    is_available: bool | None = None
    is_featured: bool | None = None
    parent_category_id: int | None = None


class MenuCategoryOut(MenuCategoryBase, TimestampedSchema):
    id: int
    parent_category_id: int | None


class MenuModifierOptionOut(BaseSchema):
    id: int
    modifier_group_id: int
    option_name: str
    price_adjustment: float
    is_default: bool
    is_available: bool
    display_order: int
    created_at: datetime


class MenuModifierGroupOut(BaseSchema):
    id: int
    menu_item_id: int
    group_name: str
    display_order: int
    selection_type: Literal["single", "multiple"]
    is_required: bool
    min_selections: int
    max_selections: int
    created_at: datetime
    options: list[MenuModifierOptionOut] = []


class MenuVariantOut(BaseSchema):
    id: int
    parent_item_id: int
    variant_name: str
    variant_sku: str
    price_adjustment: float
    is_default: bool
    is_available: bool
    created_at: datetime


class MenuItemRecipeOut(BaseSchema):
    id: int
    menu_item_id: int
    menu_variant_id: int | None
    inventory_item_id: int
    quantity_required: float
    unit_of_measure: str
    is_primary_component: bool
    waste_factor: float
    created_at: datetime


class MenuItemBase(BaseSchema):
    item_code: str = Field(..., max_length=50)
    item_name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    long_description: str | None = Field(None, max_length=2000)
    base_price: float = Field(..., ge=0)
    cost_price: float | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=500)
    is_available: bool = True
    is_featured: bool = False
    is_popular: bool = False
    display_order: int = Field(default=0, ge=0)
    prep_time_minutes: int = Field(default=10, ge=0)
    calories: int | None = Field(None, ge=0)
    minimum_tier_id: int | None = None
    tax_category_id: int | None = None


class MenuItemCreate(MenuItemBase):
    category_id: int


class MenuItemUpdate(BaseSchema):
    item_code: str | None = Field(None, max_length=50)
    item_name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    long_description: str | None = Field(None, max_length=2000)
    base_price: float | None = Field(None, ge=0)
    cost_price: float | None = Field(None, ge=0)
    image_url: str | None = Field(None, max_length=500)
    is_available: bool | None = None
    is_featured: bool | None = None
    is_popular: bool | None = None
    display_order: int | None = Field(None, ge=0)
    prep_time_minutes: int | None = Field(None, ge=0)
    calories: int | None = Field(None, ge=0)
    minimum_tier_id: int | None = None
    dietary_tags: list[str] | None = None
    tax_category_id: int | None = None
    category_id: int | None = None
    modifier_groups: list[dict] | None = None
    allergen_ids: list[int] | None = None
    dietary_tag_ids: list[int] | None = None
    recipes: list[dict] | None = None


class MenuItemOut(MenuItemBase, TimestampedSchema):
    id: int
    category_id: int
    category: MenuCategoryOut | None = None
    allergens: list[AllergenOut] = []
    dietary_tags: list[dict] | None = None
    modifier_groups: list[MenuModifierGroupOut] = []
    variants: list[MenuVariantOut] = []
    recipes: list[MenuItemRecipeOut] = []


class MenuItemPublicOut(BaseSchema):
    """Simplified menu item for public/customer view."""

    id: int
    category_id: int
    item_code: str
    item_name: str
    description: str | None
    long_description: str | None
    base_price: float
    image_url: str | None
    prep_time_minutes: int
    calories: int | None
    minimum_tier_id: int | None
    is_available: bool
    is_featured: bool
    is_popular: bool
    display_order: int
    dietary_tags: list[str] | None = None
    allergens: list[AllergenOut] = []
    modifier_groups: list[MenuModifierGroupOut] = []
    variants: list[MenuVariantOut] = []


class MenuPublicOut(BaseSchema):
    """Full public menu for a store."""

    store_id: int
    categories: list[MenuCategoryOut]
    items: list[MenuItemPublicOut]


# ── Tax Category ──

class TaxCategoryBase(BaseSchema):
    category_name: str = Field(..., min_length=1, max_length=50)
    rate: float = Field(..., ge=0, le=1)
    is_active: bool = True

class TaxCategoryCreate(TaxCategoryBase):
    pass

class TaxCategoryUpdate(BaseSchema):
    category_name: str | None = Field(None, min_length=1, max_length=50)
    rate: float | None = Field(None, ge=0, le=1)
    is_active: bool | None = None

class TaxCategoryOut(TaxCategoryBase, TimestampedSchema):
    id: int


# ── Dietary Tag ──

class DietaryTagBase(BaseSchema):
    tag_key: str = Field(..., max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=10)
    color_hex: str | None = Field(None, max_length=7)
    description: str | None = None
    is_active: bool = True

class DietaryTagCreate(DietaryTagBase):
    pass

class DietaryTagUpdate(BaseSchema):
    tag_key: str | None = Field(None, max_length=50)
    display_name: str | None = Field(None, min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=10)
    color_hex: str | None = Field(None, max_length=7)
    description: str | None = None
    is_active: bool | None = None

class DietaryTagOut(DietaryTagBase):
    id: int
    created_at: datetime
