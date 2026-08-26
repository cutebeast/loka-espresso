"""Tests for webhook security hardening."""

import hmac
import hashlib
import json

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock

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
    monkeypatch.setattr("app.api.routes.endpoints.payment.is_event_processed", AsyncMock(return_value=False))
    monkeypatch.setattr("app.api.routes.endpoints.payment.mark_event_processed", AsyncMock())

    app = FastAPI()
    app.state.limiter = limiter
    app.dependency_overrides[get_async_db] = _fake_get_db
    app.include_router(webhook_router, prefix="/api/webhooks")
    return app


@pytest.fixture
def resend_webhook_app(monkeypatch):
    """FastAPI app with only the Resend webhook router wired up."""
    from app.api.routes.endpoints.webhooks import router as resend_router
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
            def add(self, *args, **kwargs): return None
            def get(self, *args, **kwargs): return None
        yield FakeSession()

    monkeypatch.setattr("app.api.routes.endpoints.webhooks.is_event_processed", AsyncMock(return_value=False))
    monkeypatch.setattr("app.api.routes.endpoints.webhooks.mark_event_processed", AsyncMock())

    app = FastAPI()
    app.state.limiter = limiter
    app.dependency_overrides[get_async_db] = _fake_get_db
    app.include_router(resend_router, prefix="/api/webhooks")
    return app


@pytest.fixture
async def webhook_client(webhook_app):
    async with AsyncClient(transport=ASGITransport(app=webhook_app), base_url="http://test") as client:
        yield client


@pytest.fixture
async def resend_webhook_client(resend_webhook_app):
    async with AsyncClient(transport=ASGITransport(app=resend_webhook_app), base_url="http://test") as client:
        yield client



async def test_hitpay_rejected_without_secret(webhook_client, monkeypatch):
    """HitPay webhook must reject requests when salt is not configured."""
    from app.services.platform_config import PlatformConfigService

    async def empty_config(*args, **kwargs):
        return ""

    monkeypatch.setattr(PlatformConfigService, "get_str", empty_config)

    res = await webhook_client.post(
        "/api/webhooks/hitpay",
        headers={"Hitpay-Signature": "abc"},
        content=b'{"status": "completed"}',
    )
    assert res.status_code == 400
    assert "salt/webhook_secret not configured" in res.text.lower()


# ---------------------------------------------------------------------------
# HitPay idempotency
# ---------------------------------------------------------------------------


def test_extract_hitpay_event_id_from_wrapped_payload():
    """extract_event_id must find the payment request id inside data.object."""
    from app.services.webhook import extract_event_id

    payload = {
        "type": "payment_request.completed",
        "data": {
            "object": {
                "id": "hpr_123",
                "status": "completed",
            }
        },
    }
    assert extract_event_id("hitpay", payload) == "hpr_123"


# ---------------------------------------------------------------------------
# eGHL callbacks (form-encoded, HashValue sha256)
# ---------------------------------------------------------------------------


def _eghl_callback_fields(password: str = "eghl_password") -> dict:
    from app.services.eghl import build_eghl_callback_hash

    fields = {
        "TxnID": "TXN999",
        "ServiceID": "SIT",
        "PaymentID": "EG123",
        "OrderNumber": "ORD-1",
        "TxnStatus": "0",
        "Amount": "10.00",
        "CurrencyCode": "MYR",
        "AuthCode": "AUTH01",
        "TxnMessage": "Approved",
    }
    fields["HashValue"] = build_eghl_callback_hash(
        password=password,
        txn_id=fields["TxnID"],
        service_id=fields["ServiceID"],
        payment_id=fields["PaymentID"],
        txn_status=fields["TxnStatus"],
        amount=fields["Amount"],
        currency_code=fields["CurrencyCode"],
        auth_code=fields["AuthCode"],
    )
    return fields


def test_extract_eghl_event_id_uses_payment_id_and_status():
    """extract_event_id must derive a stable dedup key from flat form fields."""
    from app.services.webhook import extract_event_id

    fields = {"PaymentID": "EG123", "TxnID": "TXN999", "TxnStatus": "0"}
    assert extract_event_id("eghl", fields) == "EG123:0"
    assert extract_event_id("eghl", {"TxnStatus": "0"}) is None


@pytest.mark.asyncio
async def test_eghl_rejected_without_password(webhook_client, monkeypatch):
    """eGHL callback must reject requests when eghl.password is not configured."""
    from app.services.platform_config import PlatformConfigService

    async def empty_config(*args, **kwargs):
        return ""

    monkeypatch.setattr(PlatformConfigService, "get_str", empty_config)

    res = await webhook_client.post(
        "/api/webhooks/eghl",
        data=_eghl_callback_fields(),
    )
    assert res.status_code == 400
    assert "password not configured" in res.text.lower()


@pytest.mark.asyncio
async def test_eghl_rejected_invalid_hash(webhook_client, monkeypatch):
    """eGHL callback must reject a bad HashValue."""
    from app.services.platform_config import PlatformConfigService

    async def fake_config(*args, **kwargs):
        return "eghl_password"

    monkeypatch.setattr(PlatformConfigService, "get_str", fake_config)

    fields = _eghl_callback_fields()
    fields["HashValue"] = "0" * 64
    res = await webhook_client.post("/api/webhooks/eghl", data=fields)
    assert res.status_code == 400
    assert "invalid eghl hashvalue" in res.text.lower()


@pytest.mark.asyncio
async def test_eghl_callback_success_returns_plain_ok(webhook_client, monkeypatch):
    """A valid eGHL success callback is processed and acknowledged with OK."""
    from app.services.platform_config import PlatformConfigService

    async def fake_config(*args, **kwargs):
        return "eghl_password"

    monkeypatch.setattr(PlatformConfigService, "get_str", fake_config)

    res = await webhook_client.post("/api/webhooks/eghl", data=_eghl_callback_fields())
    assert res.status_code == 200
    assert res.text == "OK"


@pytest.mark.asyncio
async def test_eghl_webhook_deduplicates_replays(webhook_client, monkeypatch):
    """A duplicate eGHL callback should be acknowledged without reprocessing."""
    from app.services.platform_config import PlatformConfigService

    async def fake_config(*args, **kwargs):
        return "eghl_password"

    monkeypatch.setattr(PlatformConfigService, "get_str", fake_config)
    monkeypatch.setattr("app.api.routes.endpoints.payment.is_event_processed", AsyncMock(return_value=True))

    res = await webhook_client.post("/api/webhooks/eghl", data=_eghl_callback_fields())
    assert res.status_code == 200
    assert res.text == "OK"


@pytest.mark.asyncio
async def test_hitpay_webhook_deduplicates_replays(webhook_client, monkeypatch):
    """A duplicate HitPay webhook should be acknowledged without reprocessing."""
    import hmac
    import hashlib
    import json
    from app.services.platform_config import PlatformConfigService

    secret = "hitpay_salt"

    async def fake_config(*args, **kwargs):
        return secret

    monkeypatch.setattr(PlatformConfigService, "get_str", fake_config)

    payload = {
        "id": "hpr_123",
        "status": "completed",
        "payments": [{"id": "hpay_456"}],
    }
    body = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    # First request: mark as already processed
    monkeypatch.setattr("app.api.routes.endpoints.payment.is_event_processed", AsyncMock(return_value=True))

    res = await webhook_client.post(
        "/api/webhooks/hitpay",
        headers={"Hitpay-Signature": signature, "Hitpay-Event-Type": "completed"},
        content=body,
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["received"] is True
    assert data["duplicate"] is True


# ---------------------------------------------------------------------------
# Resend webhooks
# ---------------------------------------------------------------------------


def _make_resend_signature(secret: str, payload: str, msg_id: str, timestamp: int):
    """Generate Svix/Resend webhook headers for tests."""
    from datetime import datetime, timezone
    from svix.webhooks import Webhook

    wh = Webhook(secret)
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    signature = wh._inner.sign(msg_id=msg_id, timestamp=dt, data=payload)
    return {
        "svix-id": msg_id,
        "svix-timestamp": str(timestamp),
        "svix-signature": signature,
    }


@pytest.mark.asyncio
async def test_resend_rejected_without_secret(resend_webhook_client, monkeypatch):
    """Resend webhook must fail closed when no signing secret is configured."""
    async def empty_secret(*args, **kwargs):
        return None

    monkeypatch.setattr("app.api.routes.endpoints.webhooks.get_provider_secret", empty_secret)

    res = await resend_webhook_client.post(
        "/api/webhooks/resend",
        headers={"svix-signature": "v1=invalid"},
        content=b"{}",
    )
    assert res.status_code == 400
    assert "webhook secret not configured" in res.text.lower()


@pytest.mark.asyncio
async def test_resend_rejected_invalid_signature(resend_webhook_client, monkeypatch):
    """Resend webhook must reject invalid Svix signatures."""
    async def test_secret(*args, **kwargs):
        return "whsec_testsecret"

    monkeypatch.setattr("app.api.routes.endpoints.webhooks.get_provider_secret", test_secret)

    res = await resend_webhook_client.post(
        "/api/webhooks/resend",
        headers={"svix-signature": "v1=invalid"},
        content=b"{}",
    )
    assert res.status_code == 400
    assert "invalid resend signature" in res.text.lower()


@pytest.mark.asyncio
async def test_resend_accepts_valid_delivered_event(resend_webhook_client, monkeypatch):
    """Resend webhook updates campaign analytics for a valid delivered event."""
    import os
    import base64
    from datetime import timezone

    secret = "whsec_" + base64.b64encode(os.urandom(24)).decode()

    async def test_secret(*args, **kwargs):
        return secret

    monkeypatch.setattr("app.api.routes.endpoints.webhooks.get_provider_secret", test_secret)

    payload = {
        "type": "email.delivered",
        "created_at": "2026-07-06T00:00:00.000Z",
        "data": {
            "email_id": "email_123",
            "tags": {"campaign_id": "42"},
        },
    }
    body = json.dumps(payload)
    now = int(__import__("datetime").datetime.now(timezone.utc).timestamp())
    headers = _make_resend_signature(secret, body, "evt_123", now)

    res = await resend_webhook_client.post(
        "/api/webhooks/resend",
        headers=headers,
        content=body.encode(),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["received"] is True
    assert data["updated"] is True
    assert data["campaign_id"] == 42
    assert data["event_type"] == "email.delivered"


@pytest.mark.asyncio
async def test_resend_deduplicates_replays(resend_webhook_client, monkeypatch):
    """Duplicate Resend events should be acknowledged without reprocessing."""
    import os
    import base64
    from datetime import timezone

    secret = "whsec_" + base64.b64encode(os.urandom(24)).decode()

    async def test_secret(*args, **kwargs):
        return secret

    monkeypatch.setattr("app.api.routes.endpoints.webhooks.get_provider_secret", test_secret)
    monkeypatch.setattr("app.api.routes.endpoints.webhooks.is_event_processed", AsyncMock(return_value=True))

    payload = {
        "type": "email.opened",
        "created_at": "2026-07-06T00:00:00.000Z",
        "data": {
            "email_id": "email_456",
            "tags": {"campaign_id": "7"},
        },
    }
    body = json.dumps(payload)
    now = int(__import__("datetime").datetime.now(timezone.utc).timestamp())
    headers = _make_resend_signature(secret, body, "evt_456", now)

    res = await resend_webhook_client.post(
        "/api/webhooks/resend",
        headers=headers,
        content=body.encode(),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["received"] is True
    assert data["duplicate"] is True
