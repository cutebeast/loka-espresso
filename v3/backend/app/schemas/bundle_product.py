"""Bundle product schemas."""

from datetime import datetime

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class BundleComponentModifierIn(BaseSchema):
    modifier_option_id: int
    price_adjustment: float | None = None
    is_default: bool = False


class BundleComponentModifierOut(BaseSchema):
    id: int
    modifier_option_id: int
    modifier_option_name: str | None = None
    price_adjustment: float | None = None
    is_default: bool


class BundleProductComponentIn(BaseSchema):
    menu_item_id: int
    default_quantity: int = Field(default=1, ge=1)
    is_required: bool = True
    is_swappable: bool = False
    swap_group: int | None = None
    sort_order: int = 0
    modifier_overrides: list[BundleComponentModifierIn] = []


class BundleProductComponentOut(BaseSchema):
    id: int
    menu_item_id: int
    menu_item_name: str | None = None
    menu_item_price: float | None = None
    menu_item_image_url: str | None = None
    default_quantity: int
    is_required: bool
    is_swappable: bool
    swap_group: int | None
    sort_order: int
    modifier_overrides: list[BundleComponentModifierOut] = []


class BundleProductCreate(BaseSchema):
    bundle_type: str = Field(default="combo", max_length=30)
    title: str = Field(..., max_length=255)
    description: str | None = None
    image_url: str | None = None
    bundle_price: float = Field(..., ge=0)
    category_id: int | None = None
    is_active: bool = True
    display_order: int = 0
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_per_order: int = Field(default=1, ge=1)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    components: list[BundleProductComponentIn] = []


class BundleProductUpdate(BaseSchema):
    bundle_type: str | None = Field(None, max_length=30)
    title: str | None = Field(None, max_length=255)
    description: str | None = None
    image_url: str | None = None
    bundle_price: float | None = Field(None, ge=0)
    category_id: int | None = None
    is_active: bool | None = None
    display_order: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_per_order: int | None = Field(None, ge=1)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    components: list[BundleProductComponentIn] | None = None


class BundleProductOut(TimestampedSchema):
    id: int
    bundle_type: str
    title: str
    description: str | None = None
    image_url: str | None = None
    bundle_price: float
    category_id: int | None = None
    category_name: str | None = None
    is_active: bool
    display_order: int
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_per_order: int
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    deleted_at: datetime | None = None
    components: list[BundleProductComponentOut] = []
