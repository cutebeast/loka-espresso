from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class AddressCreate(BaseModel):
    label: str
    address: str
    apartment: Optional[str] = None
    building: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    state: Optional[str] = None
    delivery_instructions: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: bool = False


class AddressUpdate(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = None
    apartment: Optional[str] = None
    building: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    state: Optional[str] = None
    delivery_instructions: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: Optional[bool] = None


class AddressOut(BaseModel):
    id: int
    label: str
    address: str
    apartment: Optional[str] = None
    building: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    state: Optional[str] = None
    delivery_instructions: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: bool = False

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    phone: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    user_type_id: Optional[int] = None
    role_id: Optional[int] = None
    user_type: Optional[str] = None  # Resolved name from user_types table
    role: Optional[str] = None       # Resolved name from roles table
    avatar_url: Optional[str] = None
    referral_code: Optional[str] = None
    date_of_birth: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    pin_code: Optional[str] = None
