"""Translation domain schemas."""

from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class TranslationBase(BaseSchema):
    translation_key: str = Field(..., max_length=200)
    locale: str = Field(..., max_length=5)
    translated_text: str
    source_text: str | None = None
    namespace: str = Field(default="admin", max_length=50)
    is_auto_translated: bool = False
    # Legacy per-row fields (optional)
    table_name: str = Field(default="", max_length=50)
    record_id: int = 0
    column_name: str = Field(default="", max_length=50)


class TranslationCreate(TranslationBase):
    pass


class TranslationUpdate(BaseSchema):
    translated_text: str | None = None
    source_text: str | None = None
    translation_key: str | None = Field(None, max_length=200)
    locale: str | None = Field(None, max_length=5)
    namespace: str | None = Field(None, max_length=50)


class TranslationOut(TranslationBase, TimestampedSchema):
    id: int


class TranslateRequest(BaseSchema):
    text: str
    source_locale: str = Field(..., max_length=5)
    target_locale: str = Field(..., max_length=5)


class TranslateResponse(BaseSchema):
    translated_text: str
    source_text: str
    source_locale: str
    target_locale: str
    cached: bool


class CacheStatsOut(BaseSchema):
    hit_count: int
    miss_count: int
    total_entries: int
