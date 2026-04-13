from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SplashOut(BaseModel):
    image_url: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    dismissible: bool = True
    active_until: Optional[datetime] = None
    fallback: Optional[dict] = None


class SplashUpdate(BaseModel):
    image_url: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    dismissible: bool = True
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    is_active: Optional[bool] = None
    fallback_title: Optional[str] = None
    fallback_subtitle: Optional[str] = None
