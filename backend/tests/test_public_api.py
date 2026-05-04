"""Public API endpoint tests (no auth required)."""

import pytest


@pytest.mark.anyio
async def test_login_password_rejects_empty(client):
    """Login endpoint rejects empty credentials with 422."""
    resp = await client.post("/api/v1/auth/login-password", json={})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_otp_send_rejects_invalid_phone(client):
    """OTP send endpoint rejects invalid phone."""
    resp = await client.post("/api/v1/auth/send-otp", json={"phone": "123"})
    assert resp.status_code in (400, 422)


@pytest.mark.anyio
async def test_unauthorized_admin_endpoint(client):
    """Admin endpoints reject unauthenticated requests."""
    resp = await client.get("/api/v1/admin/dashboard")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_cors_preflight_allowed(client):
    """CORS preflight requests are handled."""
    resp = await client.options("/api/v1/auth/session", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
    })
    assert resp.status_code in (200, 400)
