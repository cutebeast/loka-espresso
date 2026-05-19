"""POS domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import BaseSchema, TimestampedSchema


class PosTerminalBase(BaseSchema):
    store_id: int = Field(..., gt=0)
    name: str = Field(..., min_length=1, max_length=100)
    terminal_code: str = Field(..., min_length=1, max_length=50)
    location_label: str | None = Field(None, max_length=100)
    is_active: bool = True


class PosTerminalCreate(PosTerminalBase):
    pass


class PosTerminalUpdate(BaseSchema):
    name: str | None = Field(None, min_length=1, max_length=100)
    terminal_code: str | None = Field(None, min_length=1, max_length=50)
    location_label: str | None = Field(None, max_length=100)
    is_active: bool | None = None


class PosTerminalOut(PosTerminalBase, TimestampedSchema):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PosSessionBase(BaseSchema):
    terminal_id: int = Field(..., gt=0)
    staff_id: int | None = None
    status: Literal["open", "closed", "paused"] = "open"
    opening_cash: float = Field(default=0, ge=0)


class PosSessionCreate(PosSessionBase):
    pass


class PosSessionClose(BaseSchema):
    closing_cash: float = Field(..., ge=0)
    discrepancy_notes: str | None = Field(None, max_length=500)


class PosSessionOut(BaseSchema):
    id: int
    terminal_id: int
    staff_id: int | None
    status: str
    opened_at: datetime
    closed_at: datetime | None
    opening_cash: float
    closing_cash: float | None
    expected_cash: float | None
    discrepancy: float | None
    discrepancy_notes: str | None
    total_sales_cash: float
    total_sales_card: float
    total_sales_qr: float
    order_count: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class OrderModificationLogBase(BaseSchema):
    order_id: int = Field(..., gt=0)
    modification_type: Literal[
        "add_item", "remove_item", "update_qty", "update_note",
        "apply_discount", "remove_discount", "update_status"
    ]
    line_item_id: int | None = None
    previous_value: dict | None = None
    new_value: dict | None = None
    reason: str | None = Field(None, max_length=200)


class OrderModificationLogCreate(OrderModificationLogBase):
    pass


class OrderModificationLogOut(OrderModificationLogBase, TimestampedSchema):
    id: int
    staff_id: int | None
    model_config = ConfigDict(from_attributes=True)
