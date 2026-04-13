from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PromoOut(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    image_url: Optional[str] = None
    promo_type: Optional[str] = None
    promo_code: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True
