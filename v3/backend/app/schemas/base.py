"""Base Pydantic schemas and common patterns."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

T = TypeVar("T")

Money = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]


class BaseSchema(BaseModel):
    """Base schema with ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)


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
