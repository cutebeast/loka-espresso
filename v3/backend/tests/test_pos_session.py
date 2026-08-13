"""Unit tests for the POS cash-session (Z-report) computation."""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.pos_session import compute_session_report


class _FakeResult:
    def __init__(self, rows=None, scalar=None):
        self._rows = rows
        self._scalar = scalar

    def all(self):
        return self._rows or []

    def scalar(self):
        return self._scalar


@pytest.mark.asyncio
async def test_cash_refunds_windowed_by_refund_completion():
    """A cash refund completed inside the session window is deducted even when
    the original payment was captured in a previous session — the refund side
    comes from refund records, not the payment's created_at window."""
    db = AsyncMock()
    session = SimpleNamespace(
        opened_at=datetime(2026, 8, 13, 0, 0, tzinfo=timezone.utc),
        opening_cash=Decimal("50.00"),
    )
    db.execute.side_effect = [
        # In-window payments: RM100 cash gross across 2 orders.
        _FakeResult(rows=[("cash", Decimal("100.00"), 2)]),
        # RM15 cash refund completed in-window (payment itself predates it).
        _FakeResult(scalar=Decimal("15.00")),
    ]

    report = await compute_session_report(
        db, session, store_id=1, until=datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)
    )

    assert report["sales_cash"] == Decimal("100.00")
    assert report["cash_refunds"] == Decimal("15.00")
    assert report["expected_cash"] == Decimal("50.00") + Decimal("100.00") - Decimal("15.00")
    assert report["order_count"] == 2
