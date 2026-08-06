"""Business-timezone helpers for date-range filtering.

Date-only filters (from <input type="date">) mean a business-local day, not a
UTC day. With the operation in Malaysia, "2026-08-07" must cover MYT
00:00–23:59, which is 2026-08-06T16:00Z – 2026-08-07T15:59Z in UTC. Filtering
timestamptz columns by UTC midnight boundaries (or worse, bare dates) shifts
or drops rows — this bit us on equipment logs and inventory movements.
"""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Asia/Kuala_Lumpur")


def day_start_utc(d: date) -> datetime:
    """Start of the business-local day as a tz-aware UTC-comparable datetime."""
    return datetime.combine(d, time.min, tzinfo=BUSINESS_TZ)


def day_end_utc(d: date) -> datetime:
    """End of the business-local day as a tz-aware UTC-comparable datetime."""
    return datetime.combine(d, time.max, tzinfo=BUSINESS_TZ)
