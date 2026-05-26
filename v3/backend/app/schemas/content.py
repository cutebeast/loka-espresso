"""Content domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class SplashScreenBase(BaseSchema):
    screen_name: str = Field(..., max_length=100)
    image_url: str = Field(..., max_length=500)
    title: str | None = Field(None, max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    show_frequency: Literal["once", "once_per_session", "every_open", "once_per_day", "always"] = "once_per_session"
    dismissible: bool = True
    duration_ms: int | None = None
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool = True
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)


class SplashScreenCreate(SplashScreenBase):
    pass


class SplashScreenUpdate(BaseSchema):
    screen_name: str | None = Field(None, max_length=100)
    image_url: str | None = Field(None, max_length=500)
    title: str | None = Field(None, max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    show_frequency: Literal["once", "once_per_session", "every_open", "once_per_day", "always"] | None = None
    dismissible: bool | None = None
    duration_ms: int | None = None
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)


class SplashScreenOut(SplashScreenBase, TimestampedSchema):
    id: int
    deleted_at: datetime | None = None


# ── Information Cards ──

class InfoCardBase(BaseSchema):
    title: str = Field(..., max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    icon: str | None = Field(None, max_length=50)
    image_url: str | None = Field(None, max_length=500)
    content_type: str = Field(default="information", max_length=20)
    action_url: str | None = Field(None, max_length=500)
    action_type: str | None = Field(None, max_length=20)
    action_label: str | None = Field(None, max_length=100)
    position: int = Field(default=0, ge=0)
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool = True
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class InfoCardCreate(InfoCardBase):
    pass

class InfoCardUpdate(BaseSchema):
    title: str | None = Field(None, max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    icon: str | None = Field(None, max_length=50)
    image_url: str | None = Field(None, max_length=500)
    content_type: str | None = Field(None, max_length=20)
    action_url: str | None = Field(None, max_length=500)
    action_type: str | None = Field(None, max_length=20)
    action_label: str | None = Field(None, max_length=100)
    position: int | None = Field(None, ge=0)
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class InfoCardOut(InfoCardBase, TimestampedSchema):
    id: int


# ── Product Cards ──

class ProductCardBase(BaseSchema):
    title: str = Field(..., max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    price: float | None = Field(None, ge=0)
    action_url: str | None = Field(None, max_length=500)
    action_label: str | None = Field(None, max_length=100)
    is_active: bool = True
    position: int = Field(default=0, ge=0)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class ProductCardCreate(ProductCardBase):
    pass

class ProductCardUpdate(BaseSchema):
    title: str | None = Field(None, max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    price: float | None = Field(None, ge=0)
    action_url: str | None = Field(None, max_length=500)
    action_label: str | None = Field(None, max_length=100)
    is_active: bool | None = None
    position: int | None = Field(None, ge=0)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class ProductCardOut(ProductCardBase, TimestampedSchema):
    id: int


# ── Event Cards ──

class EventCardBase(BaseSchema):
    title: str = Field(..., max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    action_url: str | None = Field(None, max_length=500)
    action_label: str | None = Field(None, max_length=100)
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool = True
    position: int = Field(default=0, ge=0)
    location: str | None = Field(None, max_length=255)
    event_datetime: datetime | None = None
    rsvp_enabled: bool = False
    rsvp_max_capacity: int | None = None
    rsvp_count: int = 0
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class EventCardCreate(EventCardBase):
    pass

class EventCardUpdate(BaseSchema):
    title: str | None = Field(None, max_length=255)
    slug: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    action_url: str | None = Field(None, max_length=500)
    action_label: str | None = Field(None, max_length=100)
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool | None = None
    position: int | None = Field(None, ge=0)
    location: str | None = Field(None, max_length=255)
    event_datetime: datetime | None = None
    rsvp_enabled: bool | None = None
    rsvp_max_capacity: int | None = None
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class EventCardOut(EventCardBase, TimestampedSchema):
    id: int


# ── System Pages ──

class SystemPageBase(BaseSchema):
    page_key: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    body_text: str | None = None
    is_active: bool = True

class SystemPageCreate(SystemPageBase):
    pass

class SystemPageUpdate(BaseSchema):
    page_key: str | None = Field(None, max_length=50)
    title: str | None = Field(None, max_length=255)
    body_text: str | None = None
    is_active: bool | None = None

class SystemPageOut(SystemPageBase, TimestampedSchema):
    id: int


# ── Promo Banners ──

class PromoBannerBase(BaseSchema):
    title: str = Field(..., max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    action_type: str | None = Field(None, max_length=20)
    action_url: str | None = Field(None, max_length=500)
    voucher_id: int | None = None
    survey_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool = True
    position: int = Field(default=0, ge=0)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class PromoBannerCreate(PromoBannerBase):
    pass

class PromoBannerUpdate(BaseSchema):
    title: str | None = Field(None, max_length=255)
    short_description: str | None = Field(None, max_length=500)
    long_description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    action_type: str | None = Field(None, max_length=20)
    action_url: str | None = Field(None, max_length=500)
    voucher_id: int | None = None
    survey_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool | None = None
    position: int | None = Field(None, ge=0)
    image_gallery_urls: list | None = None
    gallery_video_url: str | None = Field(None, max_length=500)

class PromoBannerOut(PromoBannerBase, TimestampedSchema):
    id: int


# ── Content Sections ──

class ContentSectionBase(BaseSchema):
    content_type: str = Field(..., max_length=30)
    content_id: int
    section_title: str | None = Field(None, max_length=255)
    section_body: str | None = None
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True

class ContentSectionCreate(ContentSectionBase):
    pass


class ContentSectionUpdate(BaseSchema):
    section_title: str | None = Field(None, max_length=255)
    section_body: str | None = None
    sort_order: int | None = Field(None, ge=0)
    is_active: bool | None = None


class ContentSectionOut(ContentSectionBase, TimestampedSchema):
    id: int


class ContentSectionItem(BaseSchema):
    section_title: str | None = Field(None, max_length=255)
    section_body: str | None = None
    is_active: bool = True


class ContentSectionBatchSaveRequest(BaseSchema):
    content_type: str = Field(..., max_length=30)
    content_id: int
    sections: list[ContentSectionItem] = []
