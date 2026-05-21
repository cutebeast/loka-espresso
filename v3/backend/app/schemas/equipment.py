"""Equipment and maintenance tracking schemas."""

from datetime import date, datetime

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class EquipmentMaintenanceLogBase(BaseSchema):
    maintenance_type: str = Field(default="preventive", pattern=r"^(preventive|corrective|inspection|repair|replacement)$")
    status: str = Field(default="scheduled", pattern=r"^(scheduled|in_progress|completed|cancelled)$")
    description: str | None = None
    performed_by: str | None = None
    cost: float | None = Field(None, ge=0)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class EquipmentMaintenanceLogCreate(EquipmentMaintenanceLogBase):
    equipment_id: int


class EquipmentMaintenanceLogUpdate(BaseSchema):
    maintenance_type: str | None = Field(None, pattern=r"^(preventive|corrective|inspection|repair|replacement)$")
    status: str | None = Field(None, pattern=r"^(scheduled|in_progress|completed|cancelled)$")
    description: str | None = None
    performed_by: str | None = None
    cost: float | None = Field(None, ge=0)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class EquipmentMaintenanceLogOut(EquipmentMaintenanceLogBase, TimestampedSchema):
    id: int
    equipment_id: int


class EquipmentBase(BaseSchema):
    store_id: int
    name: str = Field(..., min_length=1, max_length=100)
    equipment_type: str = Field(default="general", max_length=50)
    serial_number: str | None = Field(None, max_length=100)
    manufacturer: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=100)
    purchase_date: date | None = None
    warranty_expiry: date | None = None
    status: str = Field(default="operational", pattern=r"^(operational|maintenance|retired|broken)$")
    last_maintenance_date: date | None = None
    next_maintenance_date: date | None = None
    notes: str | None = None
    is_active: bool = True


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseSchema):
    store_id: int | None = None
    name: str | None = Field(None, min_length=1, max_length=100)
    equipment_type: str | None = Field(None, max_length=50)
    serial_number: str | None = Field(None, max_length=100)
    manufacturer: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    location: str | None = Field(None, max_length=100)
    purchase_date: date | None = None
    warranty_expiry: date | None = None
    status: str | None = Field(None, pattern=r"^(operational|maintenance|retired|broken)$")
    last_maintenance_date: date | None = None
    next_maintenance_date: date | None = None
    notes: str | None = None
    is_active: bool | None = None


class EquipmentOut(EquipmentBase, TimestampedSchema):
    id: int
    maintenance_logs: list[EquipmentMaintenanceLogOut] = []
