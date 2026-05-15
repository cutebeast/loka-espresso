"""Referral domain schemas."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema


class ReferralEventBase(BaseSchema):
    referrer_customer_id: int
    invitee_customer_id: int
    referral_code: str = Field(..., max_length=20)
    status: Literal["pending", "converted", "expired", "rewarded"] = "pending"


class ReferralEventCreate(ReferralEventBase):
    pass


class ReferralEventUpdate(BaseSchema):
    status: Literal["pending", "converted", "expired", "rewarded"] | None = None


class ReferralEventOut(BaseSchema):
    id: int
    referrer_customer_id: int
    invitee_customer_id: int
    referrer_name: str | None = None
    invitee_name: str | None = None
    referral_code: str
    status: Literal["pending", "converted", "expired", "rewarded"]
    converted_at: datetime | None = None
    reward_issued_at: datetime | None = None
    reward_wallet_entry_id: int | None = None
    created_at: datetime
