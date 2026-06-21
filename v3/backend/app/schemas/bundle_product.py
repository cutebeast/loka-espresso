"""Bundle product schemas."""

from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema, TimestampedSchema


class BundleGroupIn(BaseSchema):
    group_label: str = Field(..., max_length=100)
    group_description: str | None = None
    pick_count: int = Field(default=1, ge=1)
    min_pick: int = 0
    max_pick: int = 1
    sort_order: int = 0
    client_id: str | int | None = None

    @model_validator(mode="after")
    def check_pick_bounds(self):
        if self.min_pick < 0:
            raise ValueError("min_pick must be >= 0")
        if self.max_pick < self.min_pick:
            raise ValueError("max_pick must be >= min_pick")
        if not (self.min_pick <= self.pick_count <= self.max_pick):
            raise ValueError("pick_count must be between min_pick and max_pick")
        return self


class BundleGroupOut(BaseSchema):
    id: int
    group_label: str
    group_description: str | None = None
    pick_count: int
    min_pick: int
    max_pick: int
    sort_order: int
    components: list["BundleProductComponentOut"] = []


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
    bundle_group_id: int | None = None
    default_quantity: int = Field(default=1, ge=1)
    sort_order: int = 0
    modifier_overrides: list[BundleComponentModifierIn] = []


class BundleProductComponentOut(BaseSchema):
    id: int
    menu_item_id: int
    bundle_group_id: int | None = None
    menu_item_name: str | None = None
    menu_item_price: float | None = None
    menu_item_image_url: str | None = None
    default_quantity: int
    sort_order: int
    modifier_overrides: list[BundleComponentModifierOut] = []


class BundleProductCreate(BaseSchema):
    bundle_type: str = Field(default="combo", max_length=30)
    title: str = Field(..., max_length=255)
    description: str | None = None
    image_url: str | None = None
    bundle_price: float = Field(..., ge=0)
    category_id: int | None = None
    store_id: int | None = None
    is_active: bool = True
    display_order: int = 0
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_per_order: int = Field(default=1, ge=1)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    pick_count: int | None = Field(default=None, ge=1)
    allow_duplicates: bool = False
    components: list[BundleProductComponentIn] = []
    groups: list[BundleGroupIn] = []


class BundleProductUpdate(BaseSchema):
    bundle_type: str | None = Field(None, max_length=30)
    title: str | None = Field(None, max_length=255)
    description: str | None = None
    image_url: str | None = None
    bundle_price: float | None = Field(None, ge=0)
    category_id: int | None = None
    store_id: int | None = None
    is_active: bool | None = None
    display_order: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_per_order: int | None = Field(None, ge=1)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    pick_count: int | None = Field(default=None, ge=1)
    allow_duplicates: bool | None = None
    components: list[BundleProductComponentIn] | None = None
    groups: list[BundleGroupIn] | None = None


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
    store_id: int | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = None
    pick_count: int | None = None
    allow_duplicates: bool = False
    deleted_at: datetime | None = None
    components: list[BundleProductComponentOut] = []
    groups: list[BundleGroupOut] = []
