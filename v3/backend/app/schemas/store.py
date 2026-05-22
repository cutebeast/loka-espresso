"""Store domain schemas."""

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class StoreOperatingHoursBase(BaseSchema):
    day_of_week: int = Field(..., ge=0, le=6)
    open_time: time
    close_time: time
    is_closed: bool = False
    is_24_hours: bool = False
    last_order_time: time | None = None


class StoreOperatingHoursOut(StoreOperatingHoursBase, TimestampedSchema):
    id: int
    store_id: int


class StoreSpecialHoursBase(BaseSchema):
    special_date: date
    open_time: time | None = None
    close_time: time | None = None
    is_closed: bool = False
    reason: str | None = Field(None, max_length=100)


class StoreSpecialHoursOut(StoreSpecialHoursBase):
    id: int
    store_id: int
    created_at: datetime | None = None


class StoreConfigurationBase(BaseSchema):
    config_key: str = Field(..., max_length=50)
    config_value: dict = Field(default_factory=dict)
    description: str | None = Field(None, max_length=255)


class StoreConfigurationOut(StoreConfigurationBase, TimestampedSchema):
    id: int
    store_id: int


class StoreBase(BaseSchema):
    store_code: str = Field(..., max_length=20)
    store_name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., max_length=50)
    brand_name: str | None = Field(None, max_length=50)
    address_line_1: str = Field(..., max_length=255)
    address_line_2: str | None = Field(None, max_length=255)
    city: str = Field(..., max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str = Field(..., max_length=20)
    country_code: str = Field(default="MY", max_length=2)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    phone_number: str = Field(..., max_length=20)
    email_address: str | None = Field(None, max_length=255)
    timezone: str = Field(default="Asia/Kuala_Lumpur", max_length=50)
    currency_code: str = Field(default="USD", max_length=3)
    logo_url: str | None = Field(None, max_length=500)
    banner_image_url: str | None = Field(None, max_length=500)
    pickup_lead_minutes: int = Field(default=15, ge=0)
    delivery_radius_km: float = Field(default=10.0, ge=0)
    first_order_minutes_after_open: int = Field(default=30, ge=0)
    last_order_minutes_before_close: int = Field(default=45, ge=0)
    is_active: bool = True
    is_accepting_orders: bool = True
    position: int = Field(default=0, ge=0)


class StoreCreate(StoreBase):
    pass


class StoreUpdate(BaseSchema):
    store_code: str | None = Field(None, max_length=20)
    store_name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, max_length=50)
    brand_name: str | None = Field(None, max_length=50)
    address_line_1: str | None = Field(None, max_length=255)
    address_line_2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country_code: str | None = Field(None, max_length=2)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    phone_number: str | None = Field(None, max_length=20)
    email_address: str | None = Field(None, max_length=255)
    timezone: str | None = Field(None, max_length=50)
    currency_code: str | None = Field(None, max_length=3)
    logo_url: str | None = Field(None, max_length=500)
    banner_image_url: str | None = Field(None, max_length=500)
    pickup_lead_minutes: int | None = Field(None, ge=0)
    delivery_radius_km: float | None = Field(None, ge=0)
    first_order_minutes_after_open: int | None = Field(None, ge=0)
    last_order_minutes_before_close: int | None = Field(None, ge=0)
    is_active: bool | None = None
    is_accepting_orders: bool | None = None
    position: int | None = Field(None, ge=0)
    operating_hours: list[dict] | None = None


class StoreOut(StoreBase, TimestampedSchema):
    id: int
    operating_hours: list[dict] | None = None


class StorePublicOut(BaseSchema):
    """Public store info for customer app."""

    id: int
    store_code: str
    store_name: str
    slug: str
    brand_name: str | None
    address_line_1: str
    address_line_2: str | None
    city: str
    state_province: str | None
    postal_code: str
    country_code: str
    latitude: float | None
    longitude: float | None
    phone_number: str
    email_address: str | None
    timezone: str
    currency_code: str
    logo_url: str | None
    banner_image_url: str | None
    pickup_lead_minutes: int
    delivery_radius_km: float
    first_order_minutes_after_open: int
    last_order_minutes_before_close: int
    is_active: bool
    is_accepting_orders: bool
    operating_hours: list[StoreOperatingHoursOut] = []
    special_hours: list[StoreSpecialHoursOut] = []


class DiningTableBase(BaseSchema):
    table_number: str = Field(..., max_length=20)
    display_name: str | None = Field(None, max_length=50)
    capacity: int = Field(..., ge=1, le=50)
    section: str | None = Field(None, max_length=50)
    is_active: bool = True
    qr_code_image_url: str | None = Field(None, max_length=500)


class DiningTableOut(DiningTableBase, TimestampedSchema):
    id: int
    store_id: int
    qr_code_token: str | None = None
    qr_generated_at: datetime | None = None
    current_status: Literal["available", "occupied", "reserved", "cleaning", "maintenance"] = "available"
    active_order_id: int | None = None
    active_order: dict | None = None


class StoreListParams(BaseSchema):
    """Query params for listing stores."""

    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    radius_km: float | None = Field(None, gt=0, le=100)
    city: str | None = Field(None, max_length=100)
    is_open: bool | None = None
    search: str | None = Field(None, max_length=100)
