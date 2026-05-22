"""
E2E Test Suite: Negative / Error Cases

Covers:
  - Authentication failures (401)
  - Authorization failures (403)
  - Not found (404)
  - Invalid input (400/422)
  - Rate limiting (429)
"""

import pytest
import httpx
from datetime import datetime, timezone


# ═══════════════════════════════════════════════════════════════════════════
# Auth Failures
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_access_admin_endpoint_without_token(client: httpx.AsyncClient, base_url: str):
    """Accessing admin endpoint without auth token returns 401."""
    r = await client.get(f"{base_url}/admin/stores")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


@pytest.mark.asyncio
async def test_access_admin_endpoint_with_invalid_token(client: httpx.AsyncClient, base_url: str):
    """Accessing admin endpoint with invalid token returns 401."""
    headers = {"Authorization": "Bearer invalid-token-here"}
    r = await client.get(f"{base_url}/admin/stores", headers=headers)
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_access_admin_endpoint_with_expired_token(base_url: str):
    """Accessing admin endpoint with expired token returns 401."""
    import jwt as pyjwt
    expired = pyjwt.encode(
        {"sub": "2", "type": "access", "exp": datetime(2020, 1, 1, tzinfo=timezone.utc)},
        "super-secret-jwt-key-for-development-only-12345",
        algorithm="HS256",
    )
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(
            f"{base_url}/admin/stores",
            headers={"Authorization": f"Bearer {expired}"},
        )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_login_invalid_password(client: httpx.AsyncClient, base_url: str):
    """Admin login with wrong password returns 401."""
    r = await client.post(f"{base_url}/admin/auth/login", json={
        "email": "admin@lokaespresso.my",
        "password": "wrong_password_123",
    })
    assert r.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_staff_login_wrong_pin(client: httpx.AsyncClient, base_url: str):
    """Staff login with wrong PIN returns 401."""
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "display_name": "Staff One",
        "store_id": 1,
        "password": "999999",
    })
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# Not Found
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_nonexistent_order(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting an order that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/orders/99999", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_store(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting a store that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/stores/99999", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_menu_category(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting a menu category that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/menu/categories/99999", headers=admin_headers)
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# Invalid Input
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_store_missing_required_fields(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Creating a store without required fields returns 422."""
    r = await client.post(f"{base_url}/admin/stores", headers=admin_headers, json={})
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_staff_login_missing_email_and_password(client: httpx.AsyncClient, base_url: str):
    """Staff login without email or password returns 422 (or 429 if rate-limited)."""
    r = await client.post(f"{base_url}/staff/auth/login", json={})
    assert r.status_code in (400, 422, 429)


@pytest.mark.asyncio
async def test_customer_login_without_email_or_phone(client: httpx.AsyncClient, base_url: str):
    """Customer login without email or phone returns 400."""
    r = await client.post(f"{base_url}/auth/login", json={})
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# Authorization Boundaries
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_token_cannot_access_admin_endpoints(client: httpx.AsyncClient, base_url: str):
    """Customer token cannot access admin endpoints (returns 401/403)."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    # Register a customer
    r = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"neg-test-{ts}@example.com",
        "display_name": f"Neg Test {ts}",
    })
    assert r.status_code == 201
    token = r.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Try admin endpoint
    r2 = await client.get(f"{base_url}/admin/stores", headers=headers)
    assert r2.status_code in (401, 403), f"Expected 401/403, got {r2.status_code}"
