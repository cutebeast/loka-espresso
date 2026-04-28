from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class StoreOut(BaseModel):
    id: int
    name: str
    slug: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    image_url: Optional[str] = None
    opening_hours: Optional[dict] = None
    pickup_lead_minutes: int = 15
    delivery_radius_km: Optional[float] = None
    pos_integration_enabled: bool = False
    delivery_integration_enabled: bool = False
    is_active: bool = True

    class Config:
        from_attributes = True


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    image_url: Optional[str] = None
    opening_hours: Optional[dict] = None
    pickup_lead_minutes: Optional[int] = None
    delivery_radius_km: Optional[float] = None
    delivery_fee: Optional[float] = None
    min_order: Optional[float] = None
    is_active: Optional[bool] = None
    pos_integration_enabled: Optional[bool] = None
    delivery_integration_enabled: Optional[bool] = None


class StoreCreate(BaseModel):
    name: str
    slug: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    image_url: Optional[str] = None
    opening_hours: Optional[dict] = None
    pickup_lead_minutes: int = 15
    delivery_radius_km: Optional[float] = None


class StoreTableOut(BaseModel):
    id: int
    store_id: int
    table_number: str
    qr_code_url: Optional[str] = None
    qr_generated_at: Optional[datetime] = None
    capacity: int = 4
    is_active: bool = True
    is_occupied: bool = False

    class Config:
        from_attributes = True


class TableCreate(BaseModel):
    table_number: str
    capacity: int = 4


class TableUpdate(BaseModel):
    table_number: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None


class TableScanRequest(BaseModel):
    store_slug: str
    table_id: int
    qr_token: str | None = None


class PickupSlotOut(BaseModel):
    time: str
    available: bool = True


class SetTableOccupancyRequest(BaseModel):
    is_occupied: bool
