from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AddressCreate(BaseModel):
    label: str
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: bool = False


class AddressUpdate(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: Optional[bool] = None


class AddressOut(BaseModel):
    id: int
    label: str
    address: str
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
    user_type_id: int
    role_id: int
    user_type: Optional[str] = None  # Resolved name from user_types table
    role: Optional[str] = None       # Resolved name from roles table
    avatar_url: Optional[str] = None
    referral_code: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
