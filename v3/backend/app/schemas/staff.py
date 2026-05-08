"""Staff domain schemas."""

from datetime import date, datetime

from app.schemas.base import BaseSchema, TimestampedSchema


class StaffProfileBase(BaseSchema):
    store_id: int
    principal_id: int | None = None
    employee_id: str
    display_name: str
    email_address: str | None = None
    phone_number: str | None = None
    role: str | None = None  # uses StaffRole enum values
    hire_date: date | None = None
    termination_date: date | None = None
    hourly_rate: float | None = None
    tip_eligible: bool = True
    is_active: bool = True


class StaffProfileCreate(StaffProfileBase):
    pass


class StaffProfileUpdate(BaseSchema):
    # all fields optional
    display_name: str | None = None
    email_address: str | None = None
    phone_number: str | None = None
    role: str | None = None
    hire_date: date | None = None
    termination_date: date | None = None
    hourly_rate: float | None = None
    tip_eligible: bool | None = None
    is_active: bool | None = None


class StaffProfileOut(StaffProfileBase, TimestampedSchema):
    id: int


class StaffShiftBase(BaseSchema):
    store_id: int
    staff_id: int
    shift_date: date
    planned_start: datetime
    planned_end: datetime
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    break_duration_minutes: int = 0
    notes: str | None = None


class StaffShiftCreate(StaffShiftBase):
    pass


class StaffShiftUpdate(BaseSchema):
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    actual_start: datetime | None = None
    actual_end: datetime | None = None
    break_duration_minutes: int | None = None
    notes: str | None = None


class StaffShiftOut(StaffShiftBase, TimestampedSchema):
    id: int


class StaffProfileDetailOut(StaffProfileOut):
    shifts: list[StaffShiftOut] = []
