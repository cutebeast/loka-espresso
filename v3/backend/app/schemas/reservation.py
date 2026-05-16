"""Reservation domain schemas."""

from datetime import date, time
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class ReservationBase(BaseSchema):
    store_id: int
    customer_id: int | None = None
    dining_table_id: int | None = None
    party_size: int | None = Field(None, ge=1)
    reservation_date: date
    reservation_time: time
    duration_minutes: int = Field(default=90, ge=1)
    status: Literal[
        "requested",
        "confirmed",
        "seated",
        "no_show",
        "cancelled_by_guest",
        "cancelled_by_merchant",
        "completed",
    ] = "requested"
    special_requests: str | None = None


class ReservationCreate(ReservationBase):
    pass


class ReservationUpdate(BaseSchema):
    store_id: int | None = None
    customer_id: int | None = None
    dining_table_id: int | None = None
    party_size: int | None = Field(None, ge=1)
    reservation_date: date | None = None
    reservation_time: time | None = None
    duration_minutes: int | None = Field(None, ge=1)
    status: Literal[
        "requested",
        "confirmed",
        "seated",
        "no_show",
        "cancelled_by_guest",
        "cancelled_by_merchant",
        "completed",
    ] | None = None
    special_requests: str | None = None


class ReservationStatusUpdate(BaseSchema):
    status: Literal[
        "requested",
        "confirmed",
        "seated",
        "no_show",
        "cancelled_by_guest",
        "cancelled_by_merchant",
        "completed",
    ]


class ReservationOut(ReservationBase, TimestampedSchema):
    id: int
    customer_name: str | None = None
    customer_phone: str | None = None
    store_name: str | None = None
    table_number: str | None = None
