"""Unit tests for order payment-status sync (audit round 36, P1b/P3).

- _debit_wallet_for_payment re-checks the order's paid status under the row
  lock before debiting (closes the double-spend race).
- _sync_order_payment_status releases orders with no captured money and no
  pending authorization back to 'initiated' (pending_authorization limbo).
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.payment import (
    PaymentError,
    _debit_wallet_for_payment,
    _sync_order_payment_status,
)


@pytest.fixture
def fake_config(monkeypatch):
    """Patch PlatformConfigService so payment service tests do not hit the DB."""
    config = MagicMock()
    config.get_bool = AsyncMock(return_value=False)
    config.get_str = AsyncMock(return_value="")
    config.get = AsyncMock(return_value=None)
    config.get_int = AsyncMock(return_value=2)
    config.get_accounting_precision = AsyncMock(return_value=2)
    config.get_accounting_rounding = AsyncMock(return_value="ROUND_HALF_UP")
    monkeypatch.setattr(
        "app.services.payment.PlatformConfigService",
        lambda db: config,
    )
    return config


def _fake_result(value=None):
    class Result:
        def scalar_one_or_none(self):
            return value
    return Result()


def _scalars_result(rows):
    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: rows)
    return Result()


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


async def test_debit_wallet_rejects_already_paid_order():
    """The paid re-check under the row lock blocks double-spend races."""
    db = _async_db()
    order = SimpleNamespace(customer_id=1, payment_status="captured")
    db.execute.side_effect = [_fake_result(order)]

    payment = SimpleNamespace(order_id=1, amount=Decimal("50.00"))
    with pytest.raises(PaymentError) as exc_info:
        await _debit_wallet_for_payment(db, payment, 2, "ROUND_HALF_UP")
    assert "already paid" in str(exc_info.value)


async def test_sync_resets_to_initiated_when_no_active_payments(fake_config):
    """Expired/voided checkout with nothing left → order is sweepable again."""
    db = _async_db()
    order = SimpleNamespace(
        id=1,
        payment_status="pending_authorization",
        status="pending",
        total_amount=Decimal("50.00"),
        updated_at=None,
    )
    db.execute.side_effect = [
        _fake_result(order),        # locked order row
        _scalars_result([]),        # no captured/refunded payments
        _fake_result(None),         # no pending_authorization payments left
    ]

    payment = SimpleNamespace(order_id=1)
    await _sync_order_payment_status(db, payment)

    assert order.payment_status == "initiated"


async def test_sync_keeps_pending_authorization_while_payment_active(fake_config):
    """An order with a live checkout session must NOT be reset to initiated."""
    db = _async_db()
    order = SimpleNamespace(
        id=1,
        payment_status="pending_authorization",
        status="pending",
        total_amount=Decimal("50.00"),
        updated_at=None,
    )
    db.execute.side_effect = [
        _fake_result(order),        # locked order row
        _scalars_result([]),        # no captured/refunded payments
        _fake_result(99),           # a payment is still awaiting authorization
    ]

    payment = SimpleNamespace(order_id=1)
    await _sync_order_payment_status(db, payment)

    assert order.payment_status == "pending_authorization"
