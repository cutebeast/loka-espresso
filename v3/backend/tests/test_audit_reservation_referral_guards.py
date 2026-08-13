"""Unit tests for audit-fix guards: reservation table validation/double-booking,
referral crediting robustness, class-session start-time check, birthday month.

Fake-DB style follows test_payment_service.py / test_order_autocancel.py.
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.routes.endpoints.admin.reservations import (
    _check_table_availability,
    _get_bookable_table_or_400,
)
from app.core.business_time import BUSINESS_TZ
from app.services import commerce
from app.services.class_sessions import ClassSessionError, consume_session_seats


# ---------------------------------------------------------------------------
# Fake DB helpers
# ---------------------------------------------------------------------------


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, one=None, rows=None):
        self._one = one
        self._rows = rows if rows is not None else ([] if one is None else [one])

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return _FakeScalars(self._rows)


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


# ---------------------------------------------------------------------------
# R2 — table validation on assignment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_bookable_table_missing_404():
    db = _async_db()
    db.execute.return_value = _FakeResult(one=None)
    with pytest.raises(HTTPException) as exc:
        await _get_bookable_table_or_400(db, 1, store_id=1)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_bookable_table_cross_store_400():
    db = _async_db()
    db.execute.return_value = _FakeResult(
        one=SimpleNamespace(id=1, store_id=2, is_active=True)
    )
    with pytest.raises(HTTPException) as exc:
        await _get_bookable_table_or_400(db, 1, store_id=1)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_get_bookable_table_inactive_400():
    db = _async_db()
    db.execute.return_value = _FakeResult(
        one=SimpleNamespace(id=1, store_id=1, is_active=False)
    )
    with pytest.raises(HTTPException) as exc:
        await _get_bookable_table_or_400(db, 1, store_id=1)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_get_bookable_table_ok():
    db = _async_db()
    table = SimpleNamespace(id=1, store_id=1, is_active=True)
    db.execute.return_value = _FakeResult(one=table)
    assert await _get_bookable_table_or_400(db, 1, store_id=1) is table


# ---------------------------------------------------------------------------
# R1 — availability re-check (overlap detection used on every confirm)
# ---------------------------------------------------------------------------


def _res(id_, start, duration=90, status="confirmed"):
    return SimpleNamespace(
        id=id_,
        reservation_time=start,
        duration_minutes=duration,
        status=status,
    )


@pytest.mark.asyncio
async def test_availability_overlap_409():
    db = _async_db()
    db.execute.return_value = _FakeResult(rows=[_res(7, time(19, 0))])
    with pytest.raises(HTTPException) as exc:
        await _check_table_availability(db, 1, date(2026, 9, 1), time(19, 30), 90)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_availability_excludes_self():
    db = _async_db()
    db.execute.return_value = _FakeResult(rows=[])  # self excluded by query
    await _check_table_availability(
        db, 1, date(2026, 9, 1), time(19, 0), 90, exclude_reservation_id=7
    )


@pytest.mark.asyncio
async def test_availability_adjacent_slots_ok():
    db = _async_db()
    # Existing 19:00–20:30; new 20:30–22:00 — touching, not overlapping
    db.execute.return_value = _FakeResult(rows=[_res(7, time(19, 0))])
    await _check_table_availability(db, 1, date(2026, 9, 1), time(20, 30), 90)


# ---------------------------------------------------------------------------
# R5 — credit_referral_points tolerates duplicate converted rows
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_credit_referral_points_with_duplicate_events():
    db = _async_db()
    account = SimpleNamespace(
        id=5, customer_id=1, current_tier_id=None,
        points_balance=100, lifetime_points_earned=100, annual_spend=0,
    )
    dup1 = SimpleNamespace(id=11, status="converted", reward_issued_at=None)
    dup2 = SimpleNamespace(id=12, status="converted", reward_issued_at=None)
    referrer = SimpleNamespace(referral_count=0, referral_earnings_total=0)
    db.execute.side_effect = [
        _FakeResult(one=None),               # platform config → default 50
        _FakeResult(one=account),            # loyalty account
        _FakeResult(rows=[dup1, dup2]),      # duplicate converted events
        _FakeResult(rows=[]),                # tiers (recalculate → no-op)
    ]
    db.get.return_value = referrer

    credited = await commerce.credit_referral_points(db, 1, invitee_customer_id=2)

    assert credited == 50
    assert account.points_balance == 150
    assert dup1.status == "rewarded"  # first row taken, no MultipleResultsFound
    assert referrer.referral_count == 1
    assert referrer.referral_earnings_total == 50


# ---------------------------------------------------------------------------
# R6 — same-day past class sessions are not bookable
# ---------------------------------------------------------------------------


def _sess(days_ahead=0, start_time=None):
    today = datetime.now(BUSINESS_TZ).date()
    return SimpleNamespace(
        id=1,
        is_active=True,
        menu_item_id=9,
        session_date=today + timedelta(days=days_ahead),
        start_time=start_time or time(0, 0),
        booked_pax=0,
        capacity=10,
    )


@pytest.mark.asyncio
async def test_same_day_started_session_rejected():
    db = _async_db()
    one_hour_ago = (datetime.now(BUSINESS_TZ) - timedelta(hours=1)).time()
    db.execute.return_value = _FakeResult(one=_sess(start_time=one_hour_ago))
    with pytest.raises(ClassSessionError, match="already passed"):
        await consume_session_seats(db, menu_item_id=9, class_session_id=1, quantity=1)


@pytest.mark.asyncio
async def test_same_day_future_session_bookable():
    db = _async_db()
    in_one_hour = (datetime.now(BUSINESS_TZ) + timedelta(hours=1)).time()
    sess = _sess(start_time=in_one_hour)
    db.execute.return_value = _FakeResult(one=sess)
    await consume_session_seats(db, menu_item_id=9, class_session_id=1, quantity=2)
    assert sess.booked_pax == 2


@pytest.mark.asyncio
async def test_past_date_session_rejected():
    db = _async_db()
    db.execute.return_value = _FakeResult(one=_sess(days_ahead=-1, start_time=time(23, 59)))
    with pytest.raises(ClassSessionError, match="already passed"):
        await consume_session_seats(db, menu_item_id=9, class_session_id=1, quantity=1)


# ---------------------------------------------------------------------------
# R7 — birthday multiplier uses business-timezone month
# ---------------------------------------------------------------------------


class _FrozenDatetime(datetime):
    """datetime pinned to 2026-08-31 20:00 UTC = 2026-09-01 04:00 MYT."""

    @classmethod
    def now(cls, tz=None):
        pinned = datetime(2026, 8, 31, 20, 0, tzinfo=timezone.utc)
        return pinned.astimezone(tz) if tz else pinned.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_birthday_multiplier_uses_business_month(monkeypatch):
    monkeypatch.setattr(commerce, "datetime", _FrozenDatetime)
    db = _async_db()
    # September birthday: MYT is already Sep 1, UTC is still Aug 31
    db.execute.return_value = _FakeResult(one=date(1990, 9, 15))
    assert await commerce._birthday_points_multiplier(db, 1) == Decimal(2)
