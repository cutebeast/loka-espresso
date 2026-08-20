"""Wallet top-up Stripe return-URL regression (round 40).

The service must pass the caller's success/cancel URLs to Stripe verbatim —
appending a second "?session_id=…&status=…" produced a malformed double query
string and the PWA return handler never matched status=success."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import payment as payment_service


@pytest.mark.asyncio
async def test_topup_checkout_urls_used_verbatim(monkeypatch):
    captured = {}

    monkeypatch.setattr(payment_service, "_stripe_enabled", AsyncMock(return_value=True))
    monkeypatch.setattr(payment_service, "_get_stripe_secret_key", AsyncMock(return_value="sk_test_x"))
    monkeypatch.setattr(payment_service, "_get_myr_payment_method_types", AsyncMock(return_value=["card"]))
    monkeypatch.setattr(payment_service, "_get_or_create_stripe_customer", AsyncMock(return_value=None))

    cfg = MagicMock()
    cfg.get_app_public_url = AsyncMock(return_value="https://app.example.com")
    cfg.get_str = AsyncMock(return_value="stripe")
    monkeypatch.setattr(payment_service, "PlatformConfigService", lambda db: cfg)

    fake_session = SimpleNamespace(id="cs_test_1", url="https://checkout.stripe.com/pay/cs_test_1", payment_intent="pi_1")
    create_mock = MagicMock(return_value=fake_session)
    monkeypatch.setattr(payment_service.stripe.checkout.Session, "create", create_mock)

    success = "https://app.example.com/#wallet?topup_session=48&status=success"
    cancel = "https://app.example.com/#wallet?topup_session=48&status=cancel"
    await payment_service.create_wallet_topup_checkout_session(
        db=MagicMock(), session_id=48, customer_id=139,
        amount=Decimal("50"), currency_code="MYR",
        success_url=success, cancel_url=cancel,
    )

    kwargs = create_mock.call_args.kwargs
    assert kwargs["success_url"] == success
    assert kwargs["cancel_url"] == cancel
    assert kwargs["success_url"].count("?") == 1
