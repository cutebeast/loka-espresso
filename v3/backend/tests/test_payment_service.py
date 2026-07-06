"""Unit tests for core payment service flows."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.payment import Payment
from app.services.payment import (
    _credit_wallet_for_refund,
    process_webhook_event,
    refund_payment,
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
        def scalar_one(self):
            if value is None:
                raise Exception("expected one row")
            return value

        def scalar_one_or_none(self):
            return value
    return Result()


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


# ---------------------------------------------------------------------------
# Wallet refund credit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_credit_wallet_for_refund_creates_wallet_and_ledger():
    """An internal-wallet refund should credit the customer's wallet ledger."""
    db = _async_db()
    db.execute.side_effect = [
        _fake_result(42),   # customer_id
        _fake_result(None), # wallet
        _fake_result(None), # last ledger
    ]

    payment = Payment(
        id=7,
        order_id=1,
        provider="internal_wallet",
        status="captured",
        amount=Decimal("50.00"),
        captured_amount=Decimal("50.00"),
        currency_code="MYR",
    )
    refund = SimpleNamespace(id=99)

    await _credit_wallet_for_refund(
        db, payment, refund, Decimal("50.00"), 2, "ROUND_HALF_UP"
    )

    added_wallet = db.add.call_args_list[0][0][0]
    assert added_wallet.customer_id == 42
    assert added_wallet.currency_code == "MYR"

    added_ledger = db.add.call_args_list[1][0][0]
    assert added_ledger.entry_type == "credit"
    assert added_ledger.amount == Decimal("50.00")
    assert added_ledger.running_balance == Decimal("50.00")
    assert added_ledger.reference_type == "refund"
    assert added_ledger.reference_id == 99


@pytest.mark.asyncio
async def test_credit_wallet_for_refund_appends_to_existing_balance():
    """Refund credit should add to the customer's current wallet balance."""
    db = _async_db()

    class LastEntry:
        running_balance = Decimal("120.00")

    db.execute.side_effect = [
        _fake_result(42),
        _fake_result(SimpleNamespace(id=5)),
        _fake_result(LastEntry()),
    ]

    payment = Payment(
        id=8,
        order_id=2,
        provider="internal_wallet",
        status="captured",
        amount=Decimal("30.00"),
        captured_amount=Decimal("30.00"),
        currency_code="MYR",
    )
    refund = SimpleNamespace(id=100)

    await _credit_wallet_for_refund(
        db, payment, refund, Decimal("30.00"), 2, "ROUND_HALF_UP"
    )

    added_ledger = db.add.call_args[0][0]
    assert added_ledger.running_balance == Decimal("150.00")


# ---------------------------------------------------------------------------
# process_webhook_event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_webhook_event_stripe_captures_payment(monkeypatch, fake_config):
    """A Stripe payment_intent.succeeded webhook should capture the payment."""
    payment = Payment(
        id=1,
        order_id=1,
        provider="stripe",
        provider_transaction_id="pi_test",
        status="pending_authorization",
        amount=Decimal("10.00"),
        captured_amount=Decimal("0"),
        payment_method_type="credit_card",
    )

    db = _async_db()
    db.execute.return_value = _fake_result(payment)
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", AsyncMock())
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(
        db,
        "stripe",
        {
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_test",
                    "amount_received": 1000,
                    "currency": "myr",
                }
            },
        },
    )

    assert result.status == "captured"
    assert result.captured_amount == Decimal("10.00")
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_process_webhook_event_hitpay_completed_records_payment_id(monkeypatch, fake_config):
    """A HitPay payment_request.completed webhook should record the underlying payment id."""
    payment = Payment(
        id=2,
        order_id=1,
        provider="hitpay",
        provider_transaction_id="hpr_123",
        status="pending_authorization",
        amount=Decimal("25.00"),
        captured_amount=Decimal("0"),
        payment_method_type="qr_pay",
        extra_metadata={},
    )

    db = _async_db()
    db.execute.return_value = _fake_result(payment)
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", AsyncMock())
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(
        db,
        "hitpay",
        {
            "type": "payment_request.completed",
            "data": {
                "object": {
                    "id": "hpr_123",
                    "status": "completed",
                    "amount": "25.00",
                    "payments": [{"id": "hpay_456", "payment_type": "duitnow", "fees": "0.50"}],
                }
            },
        },
    )

    assert result.status == "captured"
    assert result.extra_metadata["hitpay_payment_id"] == "hpay_456"
    assert result.extra_metadata["hitpay_payment_type"] == "duitnow"


# ---------------------------------------------------------------------------
# refund_payment (internal wallet path)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refund_payment_credits_wallet_for_internal_wallet(monkeypatch, fake_config):
    """refund_payment should invoke the wallet credit helper for internal-wallet payments."""
    payment = Payment(
        id=10,
        order_id=1,
        provider="internal_wallet",
        status="captured",
        amount=Decimal("40.00"),
        captured_amount=Decimal("40.00"),
        refunded_amount=Decimal("0"),
        refund_count=0,
        currency_code="MYR",
    )

    db = _async_db()
    db.execute.return_value = _fake_result(payment)
    credit_mock = AsyncMock()
    monkeypatch.setattr("app.services.payment._credit_wallet_for_refund", credit_mock)
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", AsyncMock())
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    refund = await refund_payment(
        db,
        payment_id=10,
        amount=Decimal("40.00"),
        reason="Customer request",
        reason_category="customer_request",
        approved_by=1,
    )

    assert refund.status == "completed"
    assert payment.status == "refunded"
    credit_mock.assert_awaited_once()
