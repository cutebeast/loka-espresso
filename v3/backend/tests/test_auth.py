"""Tests for authentication hardening fixes."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.routes.deps import get_current_admin, _get_admin_role_keys
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler
from app.models.payment import Payment
from app.schemas.auth import TokenPair
from slowapi.errors import RateLimitExceeded


# ---------------------------------------------------------------------------
# Customer login
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_app(monkeypatch):
    from app.api.routes.endpoints.auth import router
    from app.api.routes.deps import get_async_db

    class FakeResult:
        def scalar_one_or_none(self):
            return None

    class FakeSession:
        async def execute(self, *args, **kwargs):
            return FakeResult()

        async def commit(self):
            pass

        async def refresh(self, *args, **kwargs):
            pass

    async def _fake_db():
        yield FakeSession()

    async def _fake_require(*args, **kwargs):
        return True

    async def _fake_register(db, data):
        ns = SimpleNamespace(
            id=1,
            phone_number=data.phone_number,
            is_active=True,
        )
        return ns

    async def _fake_tokens(customer):
        return TokenPair(access_token="a", refresh_token="r", expires_in=3600)

    monkeypatch.setattr("app.api.routes.endpoints.auth._require_otp_or_bypass", _fake_require)
    monkeypatch.setattr("app.api.routes.endpoints.auth.register_customer", _fake_register)
    monkeypatch.setattr("app.api.routes.endpoints.auth.create_customer_tokens", _fake_tokens)
    monkeypatch.setattr(
        "app.api.routes.endpoints.auth.CustomerProfileOut",
        SimpleNamespace(model_validate=lambda obj: SimpleNamespace(model_dump=lambda: {})),
    )

    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.dependency_overrides[get_async_db] = _fake_db
    app.include_router(router)
    return app


@pytest.mark.asyncio
async def test_customer_login_requires_phone_number(auth_app):
    async with AsyncClient(transport=ASGITransport(app=auth_app), base_url="http://test") as client:
        res = await client.post("/auth/login", json={"email_address": "a@example.com"})
    assert res.status_code == 400
    assert "phone_number required" in res.text.lower()


@pytest.mark.asyncio
async def test_customer_login_allows_phone_login(auth_app):
    async with AsyncClient(transport=ASGITransport(app=auth_app), base_url="http://test") as client:
        res = await client.post("/auth/login", json={"phone_number": "+60123456789"})
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# CurrentAdmin dependency
# ---------------------------------------------------------------------------


def _make_request(token: str | None = None):
    request = MagicMock()
    request.headers = {}
    request.cookies = {}
    if token:
        request.headers["Authorization"] = f"Bearer {token}"
    return request


@pytest.mark.asyncio
async def test_current_admin_rejects_real_staff_token():
    request = _make_request("dummy")
    db = AsyncMock()

    with patch("app.api.routes.deps.get_admin_access_token", return_value="dummy"), \
         patch("app.api.routes.deps.decode_token", return_value={
             "type": "staff",
             "staff_id": 5,
         }):
        with pytest.raises(HTTPException) as exc:
            await get_current_admin(request, db, None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_current_admin_accepts_admin_acting_as_staff():
    request = _make_request("dummy")
    db = AsyncMock()
    admin = SimpleNamespace(
        id=1,
        deleted_at=None,
        is_active=True,
        locked_until=None,
    )
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: admin)

    with patch("app.api.routes.deps.get_admin_access_token", return_value="dummy"), \
         patch("app.api.routes.deps.decode_token", return_value={
             "type": "staff",
             "admin_id": 1,
             "staff_id": 0,
         }):
        result = await get_current_admin(request, db, None)
    assert result is admin


@pytest.mark.asyncio
async def test_get_admin_role_keys_includes_custom_roles():
    db = AsyncMock()
    db.execute.return_value = MagicMock(all=lambda: [("system_admin",), ("custom_role",)])
    keys = await _get_admin_role_keys(db, 1)
    assert "custom_role" in keys
    assert "system_admin" in keys


# ---------------------------------------------------------------------------
# Admin me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_me_allows_readonly_analyst():
    from app.api.routes.endpoints.admin.auth import admin_me

    admin = SimpleNamespace(id=1, email="a@x", display_name="A", is_active=True, mfa_enabled=False)

    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    db = AsyncMock()
    db.execute.side_effect = [
        FakeResult([("readonly_analyst",)]),
        FakeResult([]),
    ]
    request = MagicMock()

    out = await admin_me(db, request, admin)
    assert "readonly_analyst" in out.roles


# ---------------------------------------------------------------------------
# Webhook capture guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_webhook_event_ignores_late_capture(monkeypatch):
    from app.services.payment import process_webhook_event

    payment = Payment(
        id=1,
        order_id=1,
        provider="stripe",
        provider_transaction_id="pi_test",
        status="refunded",
        amount=10,
        captured_amount=10,
        refunded_amount=10,
    )

    class FakeResult:
        def scalar_one_or_none(self):
            return payment

    db = AsyncMock()
    db.execute.return_value = FakeResult()
    monkeypatch.setattr("app.services.payment._sync_order_payment_status", AsyncMock())
    monkeypatch.setattr("app.services.payment._add_payment_event", AsyncMock())

    result = await process_webhook_event(
        db,
        "stripe",
        {"type": "payment_intent.succeeded", "data": {"object": {"id": "pi_test", "amount_received": 1000}}},
    )

    assert result.status == "refunded"
    db.commit.assert_not_awaited()
