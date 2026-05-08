"""Translation domain schemas."""

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class TranslationBase(BaseSchema):
    table_name: str = Field(..., max_length=50)
    record_id: int
    column_name: str = Field(..., max_length=50)
    locale: str = Field(..., max_length=5)
    translated_text: str


class TranslationCreate(TranslationBase):
    pass


class TranslationUpdate(BaseSchema):
    translated_text: str | None = None


class TranslationOut(TranslationBase, TimestampedSchema):
    id: int


class TranslateRequest(BaseSchema):
    text: str
    source_locale: str = Field(..., max_length=5)
    target_locale: str = Field(..., max_length=5)
    table_name: str | None = Field(None, max_length=50)
    record_id: int | None = None
    column_name: str | None = Field(None, max_length=50)


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
