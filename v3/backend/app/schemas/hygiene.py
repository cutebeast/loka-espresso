"""Hygiene report schemas — grease trap and garbage disposal."""

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class HygieneReportCreate(BaseSchema):
    store_id: int
    report_type: str = Field(..., pattern=r"^(grease_trap|garbage_disposal)$")
    description: str | None = Field(None, max_length=500)
    submitted_by: str = Field(..., max_length=100)


class HygieneReportUpdate(BaseSchema):
    status: str | None = Field(None, pattern=r"^(pending|verified|flagged)$")
    verified_by: str | None = Field(None, max_length=100)
    verified_notes: str | None = Field(None, max_length=500)


class HygieneReportOut(TimestampedSchema):
    id: int
    store_id: int
    report_type: str
    description: str | None
    status: str
    image_urls: Any | None = None
    submitted_by: str
    verified_by: str | None
    verified_at: datetime | None
    verified_notes: str | None
    created_at: datetime
