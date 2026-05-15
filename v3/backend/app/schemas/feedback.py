"""Feedback domain schemas."""

from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema


class FeedbackEntryOut(BaseSchema):
    id: int
    customer_id: int
    store_id: int | None = None
    title: str
    body: str | None = None
    rating: int
    admin_reply: str | None = None
    replied_at: datetime | None = None
    is_read: bool = False
    created_at: datetime
    # Joined fields
    customer_name: str | None = None
    store_name: str | None = None


class FeedbackReplyRequest(BaseSchema):
    admin_reply: str = Field(..., min_length=1)
    clear_reply: bool = False


class FeedbackStatsOut(BaseSchema):
    average_rating: float = 0
    total_reviews: int = 0
    rating_distribution: dict[int, int] = Field(default_factory=lambda: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0})
