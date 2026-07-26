"""Lucky draw (spin wheel) schemas."""

from datetime import datetime

from pydantic import Field

from app.schemas.base import BaseSchema, TimestampedSchema


class LuckyDrawCampaignBase(BaseSchema):
    title: str = Field(..., max_length=150)
    description: str | None = None
    is_active: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None
    spins_per_day: int = Field(1, gt=0)
    spin_interval_days: int = Field(1, ge=1)
    draw_type: str = Field("free_daily", pattern="^(free_daily|ticket_spend)$")
    spend_per_ticket_cents: int = Field(5000, gt=0)
    max_segments: int = Field(8, ge=2, le=12)


class LuckyDrawCampaignCreate(LuckyDrawCampaignBase):
    pass


class LuckyDrawCampaignUpdate(BaseSchema):
    title: str | None = Field(None, max_length=150)
    description: str | None = None
    is_active: bool | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    spins_per_day: int | None = Field(None, gt=0)
    spin_interval_days: int | None = Field(None, ge=1)
    draw_type: str | None = Field(None, pattern="^(free_daily|ticket_spend)$")
    spend_per_ticket_cents: int | None = Field(None, gt=0)
    max_segments: int | None = Field(None, ge=2, le=12)


class LuckyDrawCampaignOut(LuckyDrawCampaignBase, TimestampedSchema):
    id: int


class LuckyDrawSegmentBase(BaseSchema):
    voucher_definition_id: int
    label: str = Field(..., max_length=100)
    color_hex: str = Field("#8B5E34", max_length=20)
    probability_weight: int = Field(..., gt=0)
    sort_order: int = Field(0, ge=0)
    is_active: bool = True


class LuckyDrawSegmentCreate(LuckyDrawSegmentBase):
    pass


class LuckyDrawSegmentUpdate(BaseSchema):
    voucher_definition_id: int | None = None
    label: str | None = Field(None, max_length=100)
    color_hex: str | None = Field(None, max_length=20)
    probability_weight: int | None = Field(None, gt=0)
    sort_order: int | None = Field(None, ge=0)
    is_active: bool | None = None


class LuckyDrawSegmentOut(LuckyDrawSegmentBase, TimestampedSchema):
    id: int
    campaign_id: int


class LuckyDrawActiveCampaignOut(BaseSchema):
    """Public view of the active campaign with its wheel segments."""

    id: int
    title: str
    description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    spins_per_day: int
    spin_interval_days: int = 1
    draw_type: str = "free_daily"
    spend_per_ticket_cents: int = 5000
    max_segments: int = 8
    segments: list[LuckyDrawSegmentOut]
    spins_remaining: int | None = None
    tickets_available: int | None = None


class LuckyDrawSpinResult(BaseSchema):
    segment: LuckyDrawSegmentOut
    voucher_code: str
    voucher_title: str
    spins_remaining: int
    tickets_remaining: int | None = None


class LuckyDrawSpinReportItem(BaseSchema):
    id: int
    campaign_id: int
    customer_id: int
    customer_name: str | None = None
    customer_phone: str | None = None
    segment_id: int | None = None
    segment_label: str | None = None
    voucher_code: str | None = None
    created_at: datetime
