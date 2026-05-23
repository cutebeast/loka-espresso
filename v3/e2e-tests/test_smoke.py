"""Smoke tests — critical path verification with @pytest.mark.smoke.

These tests verify the most critical API paths are operational.
Run with: pytest -m smoke
"""

import pytest
import httpx

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD

pytestmark = [pytest.mark.smoke]


# ═══════════════════════════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_health_check(client: httpx.AsyncClient, base_url: str):
    """GET /health returns 200 OK."""
    r = await client.get(f"{base_url}/health")
    assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Admin Login
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_admin_login(client: httpx.AsyncClient, base_url: str):
    """Admin login returns access + refresh tokens."""
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
    assert "access_token" in tokens
    assert "refresh_token" in tokens


# ═══════════════════════════════════════════════════════════════════════════
# Staff Login
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_login_smoke(client: httpx.AsyncClient, base_url: str):
    """Staff login succeeds with admin credentials (for staff endpoint)."""
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "store_id": 1,
    })
    assert r.status_code == 200, f"Staff login failed: {r.text}"
    assert "access_token" in r.json()["tokens"]


# ═══════════════════════════════════════════════════════════════════════════
# Get Public Menu
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_public_menu(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Public menu endpoint returns items."""
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert len(data["items"]) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# List Orders
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_orders_smoke(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Admin can list orders."""
    r = await client.get(f"{base_url}/admin/orders?store_id=1&per_page=5", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)
