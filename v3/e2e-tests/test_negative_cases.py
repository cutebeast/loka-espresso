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
import uuid
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

from conftest import ADMIN_EMAIL, JWT_SECRET


# ═══════════════════════════════════════════════════════════════════════════
# Auth Failures
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.asyncio
async def test_access_admin_endpoint_without_token(client: httpx.AsyncClient, base_url: str):
    """Accessing admin endpoint without auth token returns 401."""
    r = await client.get(f"{base_url}/admin/stores")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


@pytest.mark.admin
@pytest.mark.asyncio
async def test_access_admin_endpoint_with_invalid_token(client: httpx.AsyncClient, base_url: str):
    """Accessing admin endpoint with invalid token returns 401."""
    headers = {"Authorization": "Bearer invalid-token-here"}
    r = await client.get(f"{base_url}/admin/stores", headers=headers)
    assert r.status_code in (401, 403)


@pytest.mark.admin
@pytest.mark.asyncio
async def test_access_admin_endpoint_with_expired_token(base_url: str, discovered_admin_id: str):
    """Accessing admin endpoint with a valid admin ID but expired token returns 401."""
    expired = pyjwt.encode(
        {
            "sub": discovered_admin_id,
            "type": "access",
            "iat": datetime.now(timezone.utc) - timedelta(hours=3),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iss": "fnb-enterprise-v3",
            "aud": "fnb-app",
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(
            f"{base_url}/admin/stores",
            headers={"Authorization": f"Bearer {expired}"},
        )
    assert r.status_code in (401, 403)


@pytest.mark.admin
@pytest.mark.asyncio
async def test_access_admin_endpoint_with_unknown_admin_id_token(base_url: str):
    """Accessing admin endpoint with a non-existent admin ID returns 401."""
    unknown = pyjwt.encode(
        {
            "sub": "99999",      # non-existent admin ID
            "type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iss": "fnb-enterprise-v3",
            "aud": "fnb-app",
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(
            f"{base_url}/admin/stores",
            headers={"Authorization": f"Bearer {unknown}"},
        )
    assert r.status_code in (401, 403)


@pytest.mark.admin
@pytest.mark.asyncio
async def test_admin_login_invalid_password(client: httpx.AsyncClient, base_url: str):
    """Admin login with wrong password returns 401."""
    r = await client.post(f"{base_url}/admin/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": "wrong_password_123",
    })
    assert r.status_code in (401, 403, 422)


@pytest.mark.admin
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

@pytest.mark.admin
@pytest.mark.asyncio
async def test_get_nonexistent_order(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting an order that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/orders/99999", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.admin
@pytest.mark.asyncio
async def test_get_nonexistent_store(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting a store that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/stores/99999", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.admin
@pytest.mark.asyncio
async def test_get_nonexistent_menu_category(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Getting a menu category that doesn't exist returns 404."""
    r = await client.get(f"{base_url}/admin/menu/categories/99999", headers=admin_headers)
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# Invalid Input
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.asyncio
async def test_create_store_missing_required_fields(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Creating a store without required fields returns 422."""
    r = await client.post(f"{base_url}/admin/stores", headers=admin_headers, json={})
    assert r.status_code in (400, 422)


@pytest.mark.admin
@pytest.mark.asyncio
async def test_staff_login_missing_email_and_password(client: httpx.AsyncClient, base_url: str):
    """Staff login without email or password returns 422 (or 429 if rate-limited)."""
    r = await client.post(f"{base_url}/staff/auth/login", json={})
    assert r.status_code in (400, 422, 429)


@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_login_without_email_or_phone(client: httpx.AsyncClient, base_url: str):
    """Customer login without email or phone returns 400."""
    r = await client.post(f"{base_url}/auth/login", json={})
    assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# Authorization Boundaries
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_token_cannot_access_admin_endpoints(client: httpx.AsyncClient, base_url: str, cleanup_registry: dict):
    """Customer token cannot access admin endpoints (returns 401/403)."""
    ts = uuid.uuid4().hex[:16]
    # Register a customer
    r = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"neg-test-{ts}@example.com",
        "display_name": f"Neg Test {ts}",
    })
    assert r.status_code == 201
    cleanup_registry["customers"].append({"id": r.json()["user_id"]})
    token = r.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Try admin endpoint
    r2 = await client.get(f"{base_url}/admin/stores", headers=headers)
    assert r2.status_code in (401, 403), f"Expected 401/403, got {r2.status_code}"


# ═══════════════════════════════════════════════════════════════════════════
# Pagination Edge Cases
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.asyncio
async def test_pagination_page_zero_returns_first_page(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """page=0 should be rejected or clamped to page 1."""
    r = await client.get(f"{base_url}/admin/stores?page=0&per_page=5", headers=admin_headers)
    assert r.status_code in (200, 400, 422), f"Unexpected status: {r.status_code}"


@pytest.mark.admin
@pytest.mark.asyncio
async def test_pagination_page_large_returns_empty(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """page=999999 should return empty items list."""
    r = await client.get(f"{base_url}/admin/stores?page=999999&per_page=5", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data["items"]) == 0
    assert data["page"] >= 1


@pytest.mark.admin
@pytest.mark.asyncio
async def test_pagination_per_page_zero(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """per_page=0 should be rejected or clamped."""
    r = await client.get(f"{base_url}/admin/stores?per_page=0", headers=admin_headers)
    assert r.status_code in (200, 400, 422), f"Unexpected status: {r.status_code}"


@pytest.mark.admin
@pytest.mark.asyncio
async def test_pagination_per_page_negative(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """per_page=-1 should be rejected."""
    r = await client.get(f"{base_url}/admin/stores?per_page=-1", headers=admin_headers)
    assert r.status_code in (400, 422), f"Unexpected status: {r.status_code}"


@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_pagination_negative_page(client: httpx.AsyncClient, base_url: str):
    """Customer endpoints should reject or clamp negative page."""
    r = await client.get(f"{base_url}/stores?page=-1")
    assert r.status_code in (200, 400, 422), f"Unexpected status: {r.status_code}"


@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_pagination_zero_per_page(client: httpx.AsyncClient, base_url: str):
    """Customer endpoints should handle per_page=0."""
    r = await client.get(f"{base_url}/stores?per_page=0")
    assert r.status_code in (200, 400, 422), f"Unexpected status: {r.status_code}"
