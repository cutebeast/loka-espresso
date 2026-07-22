"""Class session schemas."""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class ClassSessionCreate(BaseSchema):
    session_date: date
    start_time: time
    capacity: int = Field(..., gt=0, le=500)
    location: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=500)
    is_active: bool = True


class ClassSessionUpdate(BaseSchema):
    session_date: date | None = None
    start_time: time | None = None
    capacity: int | None = Field(None, gt=0, le=500)
    location: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class ClassSessionOut(TimestampedSchema):
    id: int
    menu_item_id: int
    session_date: date
    start_time: time
    capacity: int
    booked_pax: int
    location: str | None
    notes: str | None
    is_active: bool

    @property
    def remaining(self) -> int:
        return self.capacity - self.booked_pax
