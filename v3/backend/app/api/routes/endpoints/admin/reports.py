"""Admin reports — profit & margin (COGS) reporting.

Read-only endpoints. Paid population matches the admin dashboard: orders
with captured/partially_refunded/refunded payments.
"""
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Query

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.core.business_time import BUSINESS_TZ, day_end_utc, day_start_utc
from app.schemas.base import APIResponse, BaseSchema, Money
from app.services.margin_report import compute_margin_report

router = APIRouter(prefix="/admin/reports", tags=["admin — reports"])


class MarginRowOut(BaseSchema):
    menu_item_id: int
    item_name: str
    quantity: Money
    revenue: Money
    # None when the item is untracked (no recipe, or no known ingredient
    # cost) — the UI renders "—" rather than a fabricated 0-cost margin.
    cogs: Money | None
    margin: Money | None
    margin_pct: float | None
    tracked: bool
    tracked_revenue: Money
    untracked_revenue: Money


class MarginUntrackedOut(BaseSchema):
    quantity: Money
    revenue: Money
    items: int


class MarginTotalsOut(BaseSchema):
    quantity: Money
    revenue: Money
    tracked_revenue: Money
    untracked_revenue: Money
    cogs: Money
    margin: Money
    margin_pct: float | None


class MarginDailyOut(BaseSchema):
    date: str
    revenue: Money
    cogs: Money
    margin: Money
    untracked_revenue: Money


class MarginReportOut(BaseSchema):
    rows: list[MarginRowOut]
    untracked: MarginUntrackedOut
    totals: MarginTotalsOut
    daily: list[MarginDailyOut]


@router.get("/margin", response_model=APIResponse[MarginReportOut])
async def margin_report(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    # Day boundaries follow the business timezone (MYT), like the dashboard.
    today = datetime.now(BUSINESS_TZ).date()
    dfrom = day_start_utc(today) - timedelta(days=30)
    dto = day_end_utc(today)
    if from_date:
        try:
            dfrom = day_start_utc(datetime.fromisoformat(from_date).date())
        except ValueError:
            pass
    if to_date:
        try:
            dto = day_end_utc(datetime.fromisoformat(to_date).date())
        except ValueError:
            pass

    report = await compute_margin_report(db, store_id, dfrom, dto)
    return APIResponse(data=MarginReportOut(**report))
