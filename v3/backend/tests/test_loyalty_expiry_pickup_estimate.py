"""Unit tests for the /loyalty/me points-expiry fields and the shared
pickup-estimate helper (services/order.compute_pickup_estimate)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.api.routes.endpoints.admin import loyalty as loyalty_endpoint
from app.services.order import compute_pickup_estimate


# ---------------------------------------------------------------------------
# Fake DB helpers (same style as test_order_autocancel.py)
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, one=None, scalar=None):
        self._one = one
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._one

    def scalar(self):
        return self._scalar

    def one(self):
        return self._one


class _QueueDb:
    """Returns queued _FakeResult objects in call order."""

    def __init__(self, results):
        self._results = list(results)
        self.commit = AsyncMock()

    async def execute(self, _stmt):
        assert self._results, "unexpected extra query"
        return self._results.pop(0)


def _account(balance=400):
    tier = SimpleNamespace(
        display_name="Origin",
        points_multiplier=2.0,
        tier_key="origin",
        color_hex="#FF9800",
    )
    return SimpleNamespace(
        id=7,
        customer_id=42,
        current_tier=tier,
        current_tier_id=2,
        points_balance=balance,
        lifetime_points_earned=900,
        last_tier_change_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


# ---------------------------------------------------------------------------
# /loyalty/me points-expiry fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loyalty_me_exposes_expiring_points(monkeypatch):
    """Earn batches expiring within 30 days are summed and exposed with the
    nearest expiry date."""
    monkeypatch.setattr(
        "app.services.commerce._evaluate_tier_renewal", AsyncMock()
    )
    account = _account(balance=400)
    soon = datetime.now(timezone.utc) + timedelta(days=5)
    db = _QueueDb([
        _FakeResult(one=account),          # account lookup
        _FakeResult(one=(180, soon)),      # expiry aggregate (sum, min expires_at)
    ])
    customer = SimpleNamespace(id=42)

    res = await loyalty_endpoint.get_my_loyalty_account(db, customer, None)

    assert res.data.points_expiring_soon == 180
    assert res.data.next_points_expiry_at == soon


@pytest.mark.asyncio
async def test_loyalty_me_expiring_capped_at_balance(monkeypatch):
    """Spent-down batches can make the raw sum exceed the balance — the
    exposed value is an upper bound capped at the current balance."""
    monkeypatch.setattr(
        "app.services.commerce._evaluate_tier_renewal", AsyncMock()
    )
    account = _account(balance=50)
    soon = datetime.now(timezone.utc) + timedelta(days=2)
    db = _QueueDb([
        _FakeResult(one=account),
        _FakeResult(one=(300, soon)),
    ])
    customer = SimpleNamespace(id=42)

    res = await loyalty_endpoint.get_my_loyalty_account(db, customer, None)

    assert res.data.points_expiring_soon == 50
    assert res.data.next_points_expiry_at == soon


@pytest.mark.asyncio
async def test_loyalty_me_no_expiring_points(monkeypatch):
    """Nothing expiring → 0 and no date (PWA hides the warning)."""
    monkeypatch.setattr(
        "app.services.commerce._evaluate_tier_renewal", AsyncMock()
    )
    account = _account(balance=400)
    db = _QueueDb([
        _FakeResult(one=account),
        _FakeResult(one=(0, None)),
    ])
    customer = SimpleNamespace(id=42)

    res = await loyalty_endpoint.get_my_loyalty_account(db, customer, None)

    assert res.data.points_expiring_soon == 0
    assert res.data.next_points_expiry_at is None


# ---------------------------------------------------------------------------
# compute_pickup_estimate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pickup_estimate_prep_plus_queue_buffer():
    """max prep 15 min + 3 in-progress orders × 2 min buffer = ~21 minutes."""
    db = _QueueDb([
        _FakeResult(scalar=15),  # max prep_time_minutes
        _FakeResult(scalar=3),   # queue count
        _FakeResult(scalar=15),  # store pickup_lead_minutes (floor)
    ])
    before = datetime.now(timezone.utc)
    eta = await compute_pickup_estimate(db, store_id=1, menu_ids=[1, 2])
    delta = (eta - before).total_seconds() / 60
    assert 20.9 <= delta <= 21.1


@pytest.mark.asyncio
async def test_pickup_estimate_defaults_without_items():
    """No cart items → default 10-min prep, no queue — but floored at the
    store's advertised 15-min lead time."""
    db = _QueueDb([
        _FakeResult(scalar=0),   # queue count (no prep query without menu_ids)
        _FakeResult(scalar=15),  # store lead
    ])
    before = datetime.now(timezone.utc)
    eta = await compute_pickup_estimate(db, store_id=1, menu_ids=[])
    delta = (eta - before).total_seconds() / 60
    assert 14.9 <= delta <= 15.1


@pytest.mark.asyncio
async def test_pickup_estimate_queue_buffer_capped():
    """Queue buffer is capped at 30 minutes regardless of queue length."""
    db = _QueueDb([
        _FakeResult(scalar=12),   # max prep
        _FakeResult(scalar=100),  # huge queue → min(100*2, 30) = 30
        _FakeResult(scalar=15),   # store lead
    ])
    before = datetime.now(timezone.utc)
    eta = await compute_pickup_estimate(db, store_id=1, menu_ids=[1])
    delta = (eta - before).total_seconds() / 60
    assert 41.9 <= delta <= 42.1


@pytest.mark.asyncio
async def test_pickup_estimate_floored_at_store_lead():
    """A quiet store with fast items still estimates its advertised lead time
    (the store picker promises 'Ready in ~N min')."""
    db = _QueueDb([
        _FakeResult(scalar=5),   # fast prep
        _FakeResult(scalar=0),   # empty queue
        _FakeResult(scalar=20),  # store lead 20
    ])
    before = datetime.now(timezone.utc)
    eta = await compute_pickup_estimate(db, store_id=1, menu_ids=[1])
    delta = (eta - before).total_seconds() / 60
    assert 19.9 <= delta <= 20.1
