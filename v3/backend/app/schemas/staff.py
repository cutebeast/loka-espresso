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


# ── Staff Auth Requests ──

class StaffLoginRequest(BaseSchema):
    email: str | None = None
    password: str | None = None
    display_name: str | None = None
    store_id: int | None = None


class StaffRefreshRequest(BaseSchema):
    refresh_token: str


class StaffAdminStoreRequest(BaseSchema):
    token: str
    store_id: int


class StaffPinVerifyRequest(BaseSchema):
    pin: str


class StaffChangePasswordRequest(BaseSchema):
    current_password: str
    new_password: str


class StaffChangePinRequest(BaseSchema):
    current_pin: str
    new_pin: str


class POSLineItem(BaseSchema):
    menu_item_id: int
    quantity: int = 1
    special_instructions: str | None = None
    modifier_ids: list[int] | None = None


class POSPayment(BaseSchema):
    amount_tendered: float | None = None
    method: str = "cash"


class POSOrderCreateRequest(BaseSchema):
    store_id: int | None = None
    customer_id: int | None = None
    dining_table_id: int | None = None
    order_type: str = "dine_in"
    line_items: list[POSLineItem]
    payment: POSPayment | None = None
