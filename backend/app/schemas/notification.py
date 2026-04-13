from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NotificationOut(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    type: Optional[str] = None
    is_read: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
