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
    is_active: Optional[bool] = None


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


class StoreTableOut(BaseModel):
    id: int
    store_id: int
    table_number: str
    qr_code_url: Optional[str] = None
    capacity: int = 4
    is_active: bool = True

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


class PickupSlotOut(BaseModel):
    time: str
    available: bool = True
