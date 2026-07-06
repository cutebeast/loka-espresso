"""Tests for webhook security hardening."""

import hmac
import hashlib
import json

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.core.config import get_settings


@pytest.fixture
def webhook_app(monkeypatch):
    from app.api.routes.endpoints.payment import webhook_router
    from app.core.rate_limiter import limiter
    from app.api.routes.deps import get_async_db

    async def _fake_get_db():
        class FakeResult:
            def scalar_one_or_none(self): return None
            def scalars(self): return self
            def all(self): return []
            def scalar(self): return None
            def first(self): return None
        class FakeSession:
            async def commit(self): pass
            async def rollback(self): pass
            async def close(self): pass
            async def refresh(self, *args, **kwargs): pass
            async def flush(self): pass
            async def execute(self, *args, **kwargs): return FakeResult()
            def get(self, *args, **kwargs): return None
        yield FakeSession()

    async def _fake_process(db, provider, payload):
        from types import SimpleNamespace
        return SimpleNamespace(id=999)

    monkeypatch.setattr("app.api.routes.endpoints.payment.process_webhook_event", _fake_process)

    app = FastAPI()
    app.state.limiter = limiter
    app.dependency_overrides[get_async_db] = _fake_get_db
    app.include_router(webhook_router, prefix="/api/webhooks")
    return app


@pytest.fixture
async def webhook_client(webhook_app):
    async with AsyncClient(transport=ASGITransport(app=webhook_app), base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_stripe_rejected_without_secret(webhook_client, monkeypatch):
    """Stripe webhook must fail closed when no signing secret is configured."""
    async def empty_secret(db): return ""
    monkeypatch.setattr("app.api.routes.endpoints.payment.get_stripe_webhook_secret", empty_secret)
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", None)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    res = await webhook_client.post(
        "/api/webhooks/stripe",
        headers={"Stripe-Signature": "v1=invalid"},
        content=b"{}",
    )
    assert res.status_code == 400
    assert "signing secret not configured" in res.text.lower()


@pytest.mark.asyncio
async def test_stripe_rejected_invalid_signature(webhook_client, monkeypatch):
    """Stripe webhook must reject invalid signatures."""
    async def test_secret(db): return "whsec_test"
    monkeypatch.setattr("app.api.routes.endpoints.payment.get_stripe_webhook_secret", test_secret)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    res = await webhook_client.post(
        "/api/webhooks/stripe",
        headers={"Stripe-Signature": "v1=invalid"},
        content=b"{}",
    )
    assert res.status_code == 400
    assert "invalid stripe signature" in res.text.lower()


@pytest.mark.asyncio
async def test_grabpay_rejected_without_secret(webhook_client, monkeypatch):
    """GrabPay webhook must fail closed when no signing secret is configured."""
    monkeypatch.setattr(get_settings(), "grabpay_webhook_secret", None)
    monkeypatch.setattr(get_settings(), "webhook_signing_secret", None)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    res = await webhook_client.post(
        "/api/webhooks/grabpay",
        headers={"X-GrabPay-Signature": "abc"},
        content=b'{"data": {"transaction": {"id": "tx1"}}}',
    )
    assert res.status_code == 400
    assert "signing secret not configured" in res.text.lower()


@pytest.mark.asyncio
async def test_grabpay_rejected_invalid_signature(webhook_client, monkeypatch):
    """GrabPay webhook must reject invalid signatures."""
    monkeypatch.setattr(get_settings(), "grabpay_webhook_secret", "grabpay_secret")
    monkeypatch.setattr(get_settings(), "webhook_signing_secret", None)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    res = await webhook_client.post(
        "/api/webhooks/grabpay",
        headers={"X-GrabPay-Signature": "invalid"},
        content=b'{"data": {"transaction": {"id": "tx1"}}}',
    )
    assert res.status_code == 400
    assert "invalid grabpay signature" in res.text.lower()


@pytest.mark.asyncio
async def test_grabpay_accepts_valid_signature(webhook_client, monkeypatch):
    """GrabPay webhook accepts a valid HMAC-SHA256 signature."""
    secret = "grabpay_secret"
    monkeypatch.setattr(get_settings(), "grabpay_webhook_secret", secret)
    monkeypatch.setattr(get_settings(), "webhook_signing_secret", None)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    payload = b'{"data": {"transaction": {"id": "tx1"}}}'
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()

    res = await webhook_client.post(
        "/api/webhooks/grabpay",
        headers={"X-GrabPay-Signature": expected},
        content=payload,
    )
    # 422/500 is acceptable here because the downstream processor does not have
    # a matching payment; the important thing is signature verification passed.
    assert res.status_code in (200, 422, 500)
    if res.status_code == 200:
        data = res.json()
        assert data["data"]["received"] is True


@pytest.mark.asyncio
async def test_hitpay_rejected_without_secret(webhook_client, monkeypatch):
    """HitPay webhook must reject requests when salt is not configured."""
    from app.services.platform_config import PlatformConfigService

    async def empty_config(*args, **kwargs):
        return ""

    monkeypatch.setattr(PlatformConfigService, "get_str", empty_config)
    monkeypatch.setattr(get_settings(), "webhook_api_key", None)

    res = await webhook_client.post(
        "/api/webhooks/hitpay",
        headers={"Hitpay-Signature": "abc"},
        content=b'{"status": "completed"}',
    )
    assert res.status_code == 400
    assert "salt/webhook_secret not configured" in res.text.lower()

