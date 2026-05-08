"""Content domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class ContentBlockBase(BaseSchema):
    store_id: int | None = None
    block_key: str = Field(..., max_length=50)
    block_name: str = Field(..., max_length=100)
    content_type: Literal[
        "hero_banner", "promo_card", "info_card", "announcement", "story", "popup"
    ]
    title: str = Field(..., max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    body_text: str | None = None
    image_url: str | None = Field(None, max_length=500)
    image_gallery_urls: list | None = None
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    cta_action: Literal["open_detail", "apply_voucher", "open_url", "open_survey", "share"] | None = None
    voucher_definition_id: int | None = None
    survey_id: int | None = None
    background_color: str | None = Field(None, max_length=7)
    text_color: str | None = Field(None, max_length=7)
    display_order: int = 0
    start_date: datetime | None = None
    end_date: datetime | None = None
    priority: int = Field(default=0, ge=0, le=10)
    is_dismissible: bool = True
    target_segments: dict | None = None
    target_platforms: list = []
    is_active: bool = True


class ContentBlockCreate(ContentBlockBase):
    pass


class ContentBlockUpdate(BaseSchema):
    store_id: int | None = None
    block_key: str | None = Field(None, max_length=50)
    block_name: str | None = Field(None, max_length=100)
    content_type: Literal[
        "hero_banner", "promo_card", "info_card", "announcement", "story", "popup"
    ] | None = None
    title: str | None = Field(None, max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    body_text: str | None = None
    image_url: str | None = Field(None, max_length=500)
    image_gallery_urls: list | None = None
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    cta_action: Literal["open_detail", "apply_voucher", "open_url", "open_survey", "share"] | None = None
    voucher_definition_id: int | None = None
    survey_id: int | None = None
    background_color: str | None = Field(None, max_length=7)
    text_color: str | None = Field(None, max_length=7)
    display_order: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    priority: int | None = Field(None, ge=0, le=10)
    is_dismissible: bool | None = None
    target_segments: dict | None = None
    target_platforms: list | None = None
    is_active: bool | None = None


class ContentBlockOut(ContentBlockBase, TimestampedSchema):
    id: int
    created_by: int | None = None
    deleted_at: datetime | None = None


class SplashScreenBase(BaseSchema):
    store_id: int | None = None
    screen_name: str = Field(..., max_length=100)
    image_url: str = Field(..., max_length=500)
    title: str | None = Field(None, max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    show_frequency: Literal["once", "once_per_session", "every_open", "once_per_day"] = "once_per_session"
    dismissible: bool = True
    active_from: datetime
    active_until: datetime
    is_active: bool = True


class SplashScreenCreate(SplashScreenBase):
    pass


class SplashScreenUpdate(BaseSchema):
    store_id: int | None = None
    screen_name: str | None = Field(None, max_length=100)
    image_url: str | None = Field(None, max_length=500)
    title: str | None = Field(None, max_length=100)
    subtitle: str | None = Field(None, max_length=200)
    cta_text: str | None = Field(None, max_length=50)
    cta_url: str | None = Field(None, max_length=500)
    show_frequency: Literal["once", "once_per_session", "every_open", "once_per_day"] | None = None
    dismissible: bool | None = None
    active_from: datetime | None = None
    active_until: datetime | None = None
    is_active: bool | None = None


class SplashScreenOut(SplashScreenBase, TimestampedSchema):
    id: int
    deleted_at: datetime | None = None
