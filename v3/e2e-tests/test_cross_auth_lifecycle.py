"""
E2E Test Suite: Auth Token Lifecycle

Covers:
  - Customer registration + token refresh via POST /auth/refresh
  - Staff login + token refresh via POST /staff/auth/refresh
  - Admin login + token refresh via POST /admin/auth/refresh
  - Expired JWT rejection (401)
  - Expired refresh token rejection (401)
"""

import pytest
import httpx
import uuid
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET

# ═══════════════════════════════════════════════════════════════════════════
# Customer token lifecycle
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_token_refresh(
    client: httpx.AsyncClient, base_url: str, cleanup_registry: dict
):
    """Customer can register, obtain tokens, and refresh access token via POST /auth/refresh."""
    ts = uuid.uuid4().hex[:16]
    email = f"auth-test-{ts}@example.com"

    # Register
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"Auth Test {ts}",
        "device_fingerprint": f"auth-device-{ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    data = reg.json()
    cleanup_registry["customers"].append({"id": data["user_id"]})
    refresh_token = data["tokens"]["refresh_token"]
    original_access_token = data["tokens"]["access_token"]

    # Refresh token
    r = await client.post(f"{base_url}/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200, f"Refresh failed: {r.text}"
    new_tokens = r.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != original_access_token

    # Verify new token works by fetching orders
    headers = {"Authorization": f"Bearer {new_tokens['access_token']}", "Content-Type": "application/json"}
    r2 = await client.get(f"{base_url}/orders", headers=headers)
    assert r2.status_code == 200, f"New access token rejected: {r2.text}"


# ═══════════════════════════════════════════════════════════════════════════
# Staff token lifecycle
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.staff
@pytest.mark.asyncio
async def test_staff_token_refresh(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Staff can login with email+password and refresh token via POST /staff/auth/refresh."""
    # Use the seeded Test Staff credentials, not the admin fallback.
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "email": "teststaff@lokaespresso.my",
        "password": "TestStaff123!",
        "store_id": store_id,
    })
    assert r.status_code == 200, f"Staff login failed: {r.text}"
    tokens = r.json()["tokens"]
    assert "refresh_token" in tokens, "Staff login must return refresh_token"
    original_access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Refresh
    r2 = await client.post(f"{base_url}/staff/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 200, f"Staff refresh failed: {r2.text}"
    new_tokens = r2.json()
    assert "tokens" in new_tokens
    assert new_tokens["tokens"]["access_token"] != original_access_token

    # Verify new token works
    headers = {"Authorization": f"Bearer {new_tokens['tokens']['access_token']}", "Content-Type": "application/json"}
    r3 = await client.get(f"{base_url}/staff/auth/me", headers=headers)
    assert r3.status_code == 200, f"New staff access token rejected: {r3.text}"


# ═══════════════════════════════════════════════════════════════════════════
# Admin token lifecycle
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.asyncio
async def test_admin_token_refresh(client: httpx.AsyncClient, base_url: str):
    """Admin can login and refresh token via POST /admin/auth/refresh."""
    r = await client.post(f"{base_url}/admin/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    data = r.json()
    tokens = data.get("tokens", {})
    if not tokens:
        inner = data.get("data", {})
        tokens = inner.get("tokens", {})
    assert "refresh_token" in tokens, "Admin login must return refresh_token"
    original_access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Refresh
    try:
        r2 = await client.post(f"{base_url}/admin/auth/refresh", json={"refresh_token": refresh_token})
    except httpx.ConnectError:
        pytest.skip("Admin token refresh endpoint not available")
    assert r2.status_code == 200, f"Admin refresh failed: {r2.text}"
    new_tokens = r2.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != original_access_token

    # Verify new token works
    headers = {"Authorization": f"Bearer {new_tokens['access_token']}", "Content-Type": "application/json"}
    r3 = await client.get(f"{base_url}/admin/stores", headers=headers)
    assert r3.status_code == 200, f"New admin access token rejected: {r3.text}"


# ═══════════════════════════════════════════════════════════════════════════
# Expired token rejection
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_expired_token_rejected(client: httpx.AsyncClient, base_url: str):
    """An expired JWT access token is rejected with 401/403."""
    expired = pyjwt.encode(
        {
            "sub": "9999",
            "type": "customer",
            "iat": datetime.now(timezone.utc) - timedelta(hours=3),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iss": "fnb-enterprise-v3",
            "aud": "fnb-app",
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    headers = {"Authorization": f"Bearer {expired}"}
    r = await client.get(f"{base_url}/orders", headers=headers)
    assert r.status_code in (401, 403), f"Expected 401/403 for expired token, got {r.status_code}"


# ═══════════════════════════════════════════════════════════════════════════
# Expired refresh token rejection
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_refresh_with_expired_refresh_token(client: httpx.AsyncClient, base_url: str):
    """Using an expired refresh token returns 401."""
    expired_refresh = pyjwt.encode(
        {
            "sub": "9999",
            "type": "refresh",
            "iat": datetime.now(timezone.utc) - timedelta(days=10),
            "exp": datetime.now(timezone.utc) - timedelta(days=1),
            "iss": "fnb-enterprise-v3",
            "aud": "fnb-app",
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    r = await client.post(f"{base_url}/auth/refresh", json={"refresh_token": expired_refresh})
    assert r.status_code == 401, f"Expected 401 for expired refresh token, got {r.status_code}: {r.text}"
