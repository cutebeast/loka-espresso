from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class StaffCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    user_type_id: Optional[int] = None  # FK to user_types table
    role_id: Optional[int] = None       # FK to roles table
    pin_code: Optional[str] = None
    is_active: bool = True
    store_id: Optional[int] = None
    store_ids: Optional[List[int]] = None  # Multi-store assignment via user_store_access


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    user_type_id: Optional[int] = None  # Update user's user_type_id
    role_id: Optional[int] = None       # Update user's role_id
    pin_code: Optional[str] = None
    is_active: Optional[bool] = None
    store_id: Optional[int] = None
    store_ids: Optional[List[int]] = None  # Multi-store assignment via user_store_access


class StaffOut(BaseModel):
    id: int
    store_id: Optional[int] = None
    user_id: Optional[int] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str  # staff table role (legacy StaffRole)
    user_type: Optional[str] = None  # from users table
    user_role: Optional[str] = None  # from users table
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StaffShiftOut(BaseModel):
    id: int
    staff_id: int
    store_id: int
    clock_in: datetime
    clock_out: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ClockInRequest(BaseModel):
    pin_code: str


class FeedbackCreate(BaseModel):
    store_id: int
    order_id: Optional[int] = None
    rating: int
    comment: Optional[str] = None
    tags: Optional[list[str]] = None


class FeedbackOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    store_id: int
    order_id: Optional[int] = None
    rating: int
    comment: Optional[str] = None
    tags: Optional[list] = None
    is_resolved: bool
    admin_reply: Optional[str] = None
    created_at: Optional[datetime] = None
    user_name: Optional[str] = None
    store_name: Optional[str] = None

    class Config:
        from_attributes = True


class FeedbackReply(BaseModel):
    admin_reply: str


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    store_id: Optional[int] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    user_email: Optional[str] = None
    store_name: Optional[str] = None

    class Config:
        from_attributes = True


class BroadcastCreate(BaseModel):
    title: str
    body: Optional[str] = None
    audience: str = "all"
    store_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    status: str = "draft"


class BroadcastOut(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    audience: str
    store_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    sent_count: int
    open_count: int
    is_archived: bool = False
    status: str = "draft"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PromoBannerCreate(BaseModel):
    title: str
    short_description: Optional[str] = None
    image_url: Optional[str] = None
    position: int = 0
    store_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    long_description: Optional[str] = None
    survey_id: Optional[int] = None
    voucher_id: Optional[int] = None
    action_type: Optional[str] = "detail"


class PromoBannerUpdate(BaseModel):
    title: Optional[str] = None
    short_description: Optional[str] = None
    image_url: Optional[str] = None
    position: Optional[int] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    survey_id: Optional[int] = None
    voucher_id: Optional[int] = None
    action_type: Optional[str] = None
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    long_description: Optional[str] = None


class PromoBannerOut(BaseModel):
    id: int
    title: str
    short_description: Optional[str] = None
    image_url: Optional[str] = None
    position: int
    store_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool
    created_at: Optional[datetime] = None
    survey_id: Optional[int] = None
    voucher_id: Optional[int] = None
    action_type: Optional[str] = None
    terms: Optional[List[str]] = None
    how_to_redeem: Optional[str] = None
    long_description: Optional[str] = None

    class Config:
        from_attributes = True


class LoyaltyTierOut(BaseModel):
    id: int
    name: str
    min_points: int
    points_multiplier: Optional[float] = 1.0
    benefits: Optional[dict] = None
    sort_order: int = 0

    class Config:
        from_attributes = True


class LoyaltyTierUpdate(BaseModel):
    min_points: Optional[int] = None
    points_multiplier: Optional[float] = None
    benefits: Optional[dict] = None
    sort_order: Optional[int] = None


class LoyaltyTierCreate(BaseModel):
    name: str
    min_points: int
    points_multiplier: float = 1.0
    benefits: Optional[dict] = None
    sort_order: int = 0
