"""Unit tests for audit round-37 payment/order guards (M1-M14).

Covers the webhook safety nets in app.services.payment and the order-service
changes in app.services.order:

- M1/M3b: capture onto an already-paid or cancelled order is recorded but
  flagged, and capture side-effects (points/annual spend) are skipped.
- M2: late void/failed events cannot erase captured money.
- M3a: cancel_pending_order_payments expires checkout sessions of failed
  payments so a retry cannot capture onto a cancelled order.
- M4: an 'authorized' payment keeps the order out of the initiated reversion.
- M6: zero-delta charge.refunded replays do not flip captured → partially_refunded.
- M7: charge.refund.updated resolves pending refunds (completed / failed).
- M8: capture amount/currency mismatches are flagged on the payment.
- M14: referral converts on the first PAID order; order_count rolls back on cancel.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.payment import Payment
from app.services.order import (
    _convert_referral_on_first_paid_order,
    reverse_order_effects,
)
from app.services.payment import (
    _sync_order_payment_status,
    cancel_pending_order_payments,
    process_webhook_event,
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
    monkeypatch.setattr("app.services.payment.PlatformConfigService", lambda db: config)
    return config


def _fake_result(value=None):
    class Result:
        def scalar_one_or_none(self):
            return value

        def scalar(self):
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


def _payment(**overrides):
    payment = Payment(
        id=1,
        order_id=1,
        provider="stripe",
        provider_transaction_id="pi_test",
        status="pending_authorization",
        amount=Decimal("10.00"),
        captured_amount=Decimal("0"),
        refunded_amount=Decimal("0"),
        refund_count=0,
        currency_code="MYR",
        extra_metadata={},
    )
    for k, v in overrides.items():
        setattr(payment, k, v)
    return payment


def _capture_payload(amount_cents=1000, currency="myr"):
    return {
        "type": "payment_intent.succeeded",
        "data": {"object": {"id": "pi_test", "amount_received": amount_cents, "currency": currency}},
    }


# ---------------------------------------------------------------------------
# M1 — duplicate live sessions: webhook safety net
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_capture_flagged_when_order_already_paid_by_other_payment(monkeypatch, fake_config):
    """A second live session capturing onto an already-paid order is flagged."""
    payment = _payment()
    other = SimpleNamespace(captured_amount=Decimal("10.00"), refunded_amount=Decimal("0"))
    order = SimpleNamespace(id=1, status="confirmed", total_amount=Decimal("10.00"))

    db = _async_db()
    db.execute.side_effect = [
        _fake_result(payment),        # payment lookup
        _fake_result(order),          # safety-net order row
        _scalars_result([other]),     # other captured payments fully cover the order
    ]
    sync = AsyncMock()
    accrue = AsyncMock()
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", sync)
    monkeypatch.setattr("app.services.payment._accrue_loyalty_annual_spend", accrue)
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(db, "stripe", _capture_payload())

    assert result.status == "captured"  # recorded for the books
    assert result.extra_metadata["duplicate_capture"] is True
    sync.assert_not_awaited()     # no silent double-booking of side effects
    accrue.assert_not_awaited()


# ---------------------------------------------------------------------------
# M3b — capture onto a cancelled order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_capture_on_cancelled_order_flagged_and_side_effects_skipped(monkeypatch, fake_config):
    """A late retry capture onto a cancelled order is flagged, never booked."""
    payment = _payment()
    order = SimpleNamespace(id=1, status="cancelled_by_customer", total_amount=Decimal("10.00"))

    db = _async_db()
    db.execute.side_effect = [
        _fake_result(payment),
        _fake_result(order),
    ]
    sync = AsyncMock()
    accrue = AsyncMock()
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", sync)
    monkeypatch.setattr("app.services.payment._accrue_loyalty_annual_spend", accrue)
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(db, "stripe", _capture_payload())

    assert result.status == "captured"
    assert result.extra_metadata["capture_on_dead_order"] is True
    sync.assert_not_awaited()
    accrue.assert_not_awaited()


# ---------------------------------------------------------------------------
# M2 — late void/failed events cannot erase captured money
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_late_expired_event_does_not_void_captured_payment(fake_config):
    """checkout.session.expired arriving after capture leaves the payment alone."""
    payment = _payment(status="captured", captured_amount=Decimal("10.00"))

    db = _async_db()
    db.execute.side_effect = [_fake_result(payment)]

    result = await process_webhook_event(
        db,
        "stripe",
        {"type": "checkout.session.expired", "data": {"object": {"id": "pi_test"}}},
    )

    assert result.status == "captured"
    assert result.captured_amount == Decimal("10.00")
    db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# M3a — failed payments' checkout sessions expired on cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_pending_order_payments_expires_failed_sessions(monkeypatch, fake_config):
    """A failed payment's live checkout session is expired with the order's cancel."""
    failed = SimpleNamespace(id=7, provider_transaction_id="cs_123", provider="stripe")

    db = _async_db()
    db.execute.side_effect = [
        _scalars_result([]),        # no initiated/pending/authorized payments
        _scalars_result([failed]),  # one failed payment with a live session
    ]
    expire = AsyncMock()
    monkeypatch.setattr("app.services.payment._stripe_enabled", AsyncMock(return_value=True))
    monkeypatch.setattr("app.services.payment._get_stripe_secret_key", AsyncMock(return_value="key"))
    monkeypatch.setattr("app.services.payment._expire_stripe_checkout_session", expire)

    cancelled = await cancel_pending_order_payments(db, order_id=1)

    assert cancelled == []
    expire.assert_awaited_once_with("cs_123", "key")


# ---------------------------------------------------------------------------
# M4 — reversion probe includes 'authorized'
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_keeps_pending_authorization_while_payment_authorized(fake_config):
    """An order with an authorized-but-uncaptured payment must not be released."""
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
        _fake_result(99),           # an authorized payment still exists
    ]

    await _sync_order_payment_status(db, SimpleNamespace(order_id=1))

    assert order.payment_status == "pending_authorization"


# ---------------------------------------------------------------------------
# M6 — zero-delta refund webhook replay
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zero_delta_refund_webhook_keeps_captured_status(fake_config):
    """A charge.refunded replay with no new delta must not flip to partially_refunded."""
    payment = _payment(status="captured", captured_amount=Decimal("50.00"), refunded_amount=Decimal("5.00"))

    db = _async_db()
    db.execute.side_effect = [_fake_result(payment)]

    result = await process_webhook_event(
        db,
        "stripe",
        {"type": "charge.refunded", "data": {"object": {"id": "pi_test", "amount_refunded": 500}}},
    )

    assert result.status == "captured"
    db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# M7 — charge.refund.updated resolves pending refunds
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refund_update_succeeded_completes_pending_refund(fake_config):
    refund = SimpleNamespace(id=5, payment_id=10, amount=Decimal("40.00"), status="pending", provider_refund_id="re_1", completed_at=None)

    db = _async_db()
    db.execute.side_effect = [_fake_result(refund)]

    await process_webhook_event(
        db,
        "stripe",
        {"type": "charge.refund.updated", "data": {"object": {"id": "re_1", "status": "succeeded"}}},
    )

    assert refund.status == "completed"
    assert refund.completed_at is not None
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_refund_update_failed_restores_payment_books(monkeypatch, fake_config):
    """A failed provider refund restores refunded_amount and recomputes status."""
    refund = SimpleNamespace(id=5, payment_id=10, amount=Decimal("40.00"), status="pending", provider_refund_id="re_1")
    payment = _payment(
        id=10,
        status="refunded",
        captured_amount=Decimal("40.00"),
        refunded_amount=Decimal("40.00"),
        refund_count=1,
    )

    db = _async_db()
    db.execute.side_effect = [
        _fake_result(refund),   # refund by provider_refund_id
        _fake_result(payment),  # payment reload
    ]
    sync = AsyncMock()
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", sync)
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    await process_webhook_event(
        db,
        "stripe",
        {"type": "charge.refund.updated", "data": {"object": {"id": "re_1", "status": "failed"}}},
    )

    assert refund.status == "failed"
    assert payment.refunded_amount == Decimal("0.00")
    assert payment.refund_count == 0
    assert payment.status == "captured"
    assert payment.extra_metadata["refund_failed_needs_reconciliation"] == 5
    sync.assert_awaited_once()


# ---------------------------------------------------------------------------
# M8 — capture amount/currency cross-check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_capture_amount_mismatch_flagged_but_recorded(monkeypatch, fake_config):
    payment = _payment()
    order = SimpleNamespace(id=1, status="pending", total_amount=Decimal("25.00"))

    db = _async_db()
    db.execute.side_effect = [
        _fake_result(payment),
        _fake_result(order),
        _scalars_result([]),
    ]
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", AsyncMock())
    monkeypatch.setattr("app.services.payment._accrue_loyalty_annual_spend", AsyncMock())
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(db, "stripe", _capture_payload(amount_cents=2500))

    assert result.status == "captured"
    assert result.captured_amount == Decimal("25.00")
    assert result.extra_metadata["capture_amount_mismatch"] is True


# ---------------------------------------------------------------------------
# M14 — referral converts on first PAID order; order_count rolls back
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_referral_converts_on_first_paid_order():
    db = _async_db()
    db.execute.side_effect = [
        _fake_result(0),  # no prior paid orders
        _fake_result(None),  # the UPDATE ... status='converted'
    ]
    order = SimpleNamespace(id=1, customer_id=7)

    await _convert_referral_on_first_paid_order(db, order)

    assert db.execute.await_count == 2  # probe + conversion update


@pytest.mark.asyncio
async def test_referral_not_converted_when_prior_paid_order_exists():
    db = _async_db()
    db.execute.side_effect = [_fake_result(1)]  # a prior paid order exists
    order = SimpleNamespace(id=1, customer_id=7)

    await _convert_referral_on_first_paid_order(db, order)

    assert db.execute.await_count == 1  # probe only — no conversion update


@pytest.mark.asyncio
async def test_reverse_effects_decrements_order_count_for_app_orders():
    """customer-channel orders were counted at creation; cancel must roll back."""
    db = _async_db()
    db.execute.side_effect = [
        _scalars_result([]),  # class session lines
        _scalars_result([]),  # customer vouchers
        _scalars_result([]),  # customer rewards
        _scalars_result([]),  # order line items (no stock restore)
    ]
    customer = SimpleNamespace(order_count=3)
    db.get = AsyncMock(return_value=customer)
    order = SimpleNamespace(
        id=5, order_number="ORD-5", customer_id=7, store_id=3,
        loyalty_points_earned=0, dining_table_id=None, order_channel="mobile_app",
    )

    await reverse_order_effects(db, order)

    assert customer.order_count == 2


@pytest.mark.asyncio
async def test_reverse_effects_skips_order_count_for_pos_orders():
    """POS orders never incremented order_count — cancel must not decrement it."""
    db = _async_db()
    db.execute.side_effect = [
        _scalars_result([]),  # class session lines
        _scalars_result([]),  # customer vouchers
        _scalars_result([]),  # customer rewards
        _scalars_result([]),  # order line items (no stock restore)
    ]
    db.get = AsyncMock()
    order = SimpleNamespace(
        id=5, order_number="POS-5", customer_id=7, store_id=3,
        loyalty_points_earned=0, dining_table_id=None, order_channel="pos",
    )

    await reverse_order_effects(db, order)

    db.get.assert_not_awaited()
