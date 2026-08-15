"""Unit tests for the guest-pay wallet path (audit round 36, P1).

Wallet spend via the unauthenticated guest-pay endpoint must require an OTP
proving phone ownership, must only debit an existing ACTIVE customer's wallet
(never auto-register), and must route through the full capture pipeline.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.routes.endpoints import payment as payment_endpoints


def _fake_result(value=None):
    class Result:
        def scalar_one_or_none(self):
            return value

        def scalar_one(self):
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


def _fake_order(**overrides):
    order = SimpleNamespace(
        id=1,
        order_number="QFC-0001",
        payment_status="initiated",
        status="pending",
        customer_id=None,
        total_amount=Decimal("50.00"),
        total_amount_currency="MYR",
    )
    for k, v in overrides.items():
        setattr(order, k, v)
    return order


def _fake_config():
    config = MagicMock()
    config.get_app_public_url = AsyncMock(return_value="https://app.example.com")
    config.get_accounting_precision = AsyncMock(return_value=2)
    config.get_accounting_rounding = AsyncMock(return_value="ROUND_HALF_UP")
    return config


async def test_guest_pay_wallet_without_phone_rejected():
    """provider=wallet with no phone_number → 400 before any OTP/lookup."""
    db = _async_db()
    order = _fake_order()
    with (
        patch.object(payment_endpoints, "_validate_guest_token_or_404", AsyncMock(return_value=order)),
        patch.object(payment_endpoints, "_require_otp_or_bypass", AsyncMock(return_value=True)) as otp,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await payment_endpoints.guest_pay(
                1, db, token="tok", provider="wallet", phone_number=None, otp_code="123456"
            )
    assert exc_info.value.status_code == 400
    otp.assert_not_called()


async def test_guest_pay_wallet_without_otp_rejected():
    """provider=wallet with a valid phone but failing/absent OTP → 401."""
    db = _async_db()
    order = _fake_order()
    with (
        patch.object(payment_endpoints, "_validate_guest_token_or_404", AsyncMock(return_value=order)),
        patch.object(payment_endpoints, "PlatformConfigService", lambda db: _fake_config()),
        patch.object(payment_endpoints, "_require_otp_or_bypass", AsyncMock(return_value=False)),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await payment_endpoints.guest_pay(
                1, db, token="tok", provider="wallet", phone_number="+60123456789", otp_code=None
            )
    assert exc_info.value.status_code == 401
    db.add.assert_not_called()


async def test_guest_pay_wallet_never_auto_registers():
    """Verified OTP but no active customer → 400, and NO customer is created."""
    db = _async_db()
    order = _fake_order()
    with (
        patch.object(payment_endpoints, "_validate_guest_token_or_404", AsyncMock(return_value=order)),
        patch.object(payment_endpoints, "PlatformConfigService", lambda db: _fake_config()),
        patch.object(payment_endpoints, "_require_otp_or_bypass", AsyncMock(return_value=True)),
    ):
        db.execute.side_effect = [_fake_result(None)]  # no active customer
        with pytest.raises(HTTPException) as exc_info:
            await payment_endpoints.guest_pay(
                1, db, token="tok", provider="wallet", phone_number="+60123456789", otp_code="123456"
            )
    assert exc_info.value.status_code == 400
    assert "No active customer" in exc_info.value.detail
    # Nothing persisted — no auto-registration on the wallet path
    db.add.assert_not_called()


async def test_guest_pay_wallet_success_routes_through_capture_pipeline():
    """Happy path: wallet debited, order linked, full capture hooks fired."""
    db = _async_db()
    order = _fake_order()
    customer = SimpleNamespace(id=42, phone_number="+60123456789")
    with (
        patch.object(payment_endpoints, "_validate_guest_token_or_404", AsyncMock(return_value=order)),
        patch.object(payment_endpoints, "PlatformConfigService", lambda db: _fake_config()),
        patch.object(payment_endpoints, "_require_otp_or_bypass", AsyncMock(return_value=True)),
        patch.object(payment_endpoints, "_debit_wallet_for_payment", AsyncMock()) as debit,
        patch.object(payment_endpoints, "_sync_order_payment_status", AsyncMock()) as sync,
        patch.object(payment_endpoints, "_accrue_loyalty_annual_spend", AsyncMock()) as accrue,
        patch.object(payment_endpoints, "_add_payment_event", AsyncMock()),
        patch("app.services.einvoice.auto_issue_on_payment", AsyncMock()),
    ):
        db.execute.side_effect = [
            _fake_result(customer),  # active customer lookup
            _scalars_result([]),     # double-charge guard: no open payments to void
            _scalars_result([]),     # double-charge guard: no failed sessions to expire
            _fake_result(order),     # post-cancel order re-read under row lock
            _scalars_result([]),     # net-of-refund: no captured payments
        ]
        resp = await payment_endpoints.guest_pay(
            1, db, token="tok", provider="wallet", phone_number="+60123456789", otp_code="123456"
        )
    assert resp.data["wallet_paid"] is True
    assert order.customer_id == 42  # order linked to the OTP-verified customer
    debit.assert_awaited_once()
    sync.assert_awaited_once()
    accrue.assert_awaited_once()
