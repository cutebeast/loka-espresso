"""Schemas for help center / internal wiki articles."""
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


HelpAudience = Literal["admin", "staff", "customer"]


class HelpArticleBase(BaseSchema):
    slug: str = Field(..., max_length=100)
    title: str = Field(..., max_length=255)
    audience: HelpAudience = "admin"
    category: str | None = Field(None, max_length=50)
    body_text: str | None = None
    position: int = 0
    is_active: bool = True


class HelpArticleCreate(HelpArticleBase):
    pass


class HelpArticleUpdate(BaseSchema):
    slug: str | None = Field(None, max_length=100)
    title: str | None = Field(None, max_length=255)
    audience: HelpAudience | None = None
    category: str | None = Field(None, max_length=50)
    body_text: str | None = None
    position: int | None = None
    is_active: bool | None = None


class HelpArticleOut(HelpArticleBase, TimestampedSchema):
    id: int


class HelpArticlePublicOut(HelpArticleBase, TimestampedSchema):
    id: int
