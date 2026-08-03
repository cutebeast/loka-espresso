"""Base Pydantic schemas and common patterns."""

import types
import typing
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

T = TypeVar("T")

Money = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]


def _allows_none(annotation: Any) -> bool:
    if annotation is None or annotation is type(None):
        return True
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        return type(None) in typing.get_args(annotation)
    return False


class BaseSchema(BaseModel):
    """Base schema with ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _empty_strings_to_none(cls, data: Any) -> Any:
        """Treat empty/whitespace-only strings as absent (None) — but ONLY
        for fields whose type allows None.

        HTML forms submit untouched optional fields as "" — without this,
        optional Decimal/int/datetime fields 422 with e.g. decimal_parsing
        (round 35: menu item add/edit broke on addon_discount_value="").
        Required-str fields must keep "" (e.g. UI translations use
        table_name=""/column_name="" as the not-table-bound convention).
        """
        if not isinstance(data, dict):
            return data
        try:
            fields = cls.model_fields
        except Exception:
            return data
        # Map payload keys (field name, alias, validation_alias) → nullable?
        nullable_keys: set[str] = set()
        for name, f in fields.items():
            if _allows_none(f.annotation):
                nullable_keys.add(name)
                if f.alias:
                    nullable_keys.add(f.alias)
                if f.validation_alias and isinstance(f.validation_alias, str):
                    nullable_keys.add(f.validation_alias)
        return {
            k: (None if isinstance(v, str) and not v.strip() and k in nullable_keys else v)
            for k, v in data.items()
        }

    @model_validator(mode="after")
    def _naive_datetimes_to_utc(self) -> "BaseSchema":
        """Pin naive datetimes to UTC.

        The app stores timestamptz, but the host TZ is NOT UTC (Europe/Berlin)
        and asyncpg encodes naive datetimes with the host offset — a date-only
        input like "2026-08-05" silently stored as 2026-08-04 22:00Z (the
        promo-banner date-drift bug). Treating naive as UTC makes date-only
        values round-trip exactly.
        """
        for name in type(self).model_fields:
            v = getattr(self, name, None)
            if isinstance(v, datetime) and v.tzinfo is None:
                object.__setattr__(self, name, v.replace(tzinfo=timezone.utc))
        return self


class TimestampedSchema(BaseSchema):
    """Mixin for created_at / updated_at."""

    created_at: datetime
    updated_at: datetime


class SoftDeleteSchema(BaseSchema):
    """Mixin for soft-deleted entities."""

    deleted_at: datetime | None = None


class APIResponse(BaseSchema, Generic[T]):
    """Standard API response wrapper."""

    success: bool = True
    message: str | None = None
    data: T | None = None
    errors: list[dict[str, Any]] | None = None


class PaginationParams(BaseSchema):
    """Request pagination parameters."""

    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)


class PaginatedResponse(BaseSchema, Generic[T]):
    """Paginated list response."""

    items: list[T]
    total: int
    page: int
    per_page: int
    total_pages: int


class IDSchema(BaseSchema):
    """Simple ID response."""

    id: int
