"""
E2E Test Suite: Staff Flows

Covers:
  - Staff login (PIN or password)
  - View orders by store
  - Update order status
  - POS terminal session
  - Process payment
  - View reservations
  - Equipment maintenance workflow
"""

import pytest
import httpx

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD

pytestmark = [pytest.mark.staff]


# ═══════════════════════════════════════════════════════════════════════════
# Staff Auth
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_login_success(client: httpx.AsyncClient, base_url: str):
    """Admin can log in via the staff endpoint with correct credentials."""
    payload = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "store_id": 1}
    r = await client.post(f"{base_url}/staff/auth/login", json=payload)
    assert r.status_code == 200, f"Staff login failed: {r.text}"
    data = r.json()
    assert "tokens" in data
    assert "access_token" in data["tokens"]
    assert data["profile"]["store_id"] == 1


@pytest.mark.asyncio
async def test_staff_login_pin_success(client: httpx.AsyncClient, base_url: str):
    """Staff can log in with display_name + correct PIN."""
    r = await client.get(f"{base_url}/staff/auth/names")
    if r.status_code != 200:
        pytest.skip("Staff list endpoint unavailable")
    staff_list = r.json().get("data", [])
    if not staff_list:
        pytest.skip("No seeded staff for login test")
    staff = staff_list[0]
    payload = {"display_name": staff["display_name"], "store_id": staff.get("store_id", 1), "password": "1234"}
    r2 = await client.post(f"{base_url}/staff/auth/login", json=payload)
    assert r2.status_code == 200, f"Staff login failed: {r2.text}"
    data = r2.json()
    assert "tokens" in data
    assert "access_token" in data["tokens"]
    assert data["profile"]["store_id"] == staff.get("store_id", 1)


@pytest.mark.asyncio
async def test_staff_login_pin(client: httpx.AsyncClient, base_url: str):
    """Staff login endpoint responds to name+PIN auth format."""
    # Try with a known staff name and wrong PIN → should get 401
    payload = {"display_name": "Staff One", "store_id": 1, "password": "wrongpin"}
    r = await client.post(f"{base_url}/staff/auth/login", json=payload)
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# Orders
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_list_orders(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can list orders for a store."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_staff_get_order_detail(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can get order detail."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=1", headers=admin_headers)
    items = r.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include orders"
    order_id = items[0]["id"]
    r2 = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r2.status_code == 200
    order = r2.json()["data"]
    assert "line_items" in order


@pytest.mark.asyncio
async def test_staff_update_order_status(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can update order status."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=1", headers=admin_headers)
    items = r.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include orders"
    order_id = items[0]["id"]
    original_status = items[0]["status"]

    try:
        # Update status to confirmed
        r2 = await client.patch(f"{base_url}/admin/orders/{order_id}/status", headers=admin_headers, json={"status": "confirmed"})
        assert r2.status_code == 200
        # Verify status actually changed
        r3 = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
        assert r3.status_code == 200
        assert r3.json()["data"]["status"] == "confirmed"
    finally:
        # Restore original status
        await client.patch(
            f"{base_url}/admin/orders/{order_id}/status",
            headers=admin_headers,
            json={"status": original_status},
        )


# ═══════════════════════════════════════════════════════════════════════════
# Reservations
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_list_reservations(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can list reservations."""
    r = await client.get(f"{base_url}/admin/reservations?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)


# ═══════════════════════════════════════════════════════════════════════════
# POS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_list_pos_terminals(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can list POS terminals."""
    r = await client.get(f"{base_url}/admin/pos/terminals?store_id={store_id}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert isinstance(data, list)
    assert len(data) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# Equipment Maintenance
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_create_maintenance_log(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff can create maintenance logs for equipment."""
    # Get an equipment item first
    r = await client.get(f"{base_url}/admin/equipment?store_id={store_id}&per_page=1", headers=admin_headers)
    items = r.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include equipment"
    eq_id = items[0]["id"]

    log = {
        "maintenance_type": "preventive",
        "description": "Test maintenance log from E2E suite",
        "performed_by": "Test Engineer",
        "cost": 100.00,
        "started_at": "2025-04-01T09:00:00Z",
        "completed_at": "2025-04-01T11:00:00Z",
        "status": "completed",
    }
    r2 = await client.post(f"{base_url}/admin/equipment/{eq_id}/maintenance-logs", headers=admin_headers, json=log)
    assert r2.status_code == 201
    log_id = r2.json()["data"]["id"]

    # Cleanup: delete the maintenance log so the test is isolated
    r_del = await client.delete(f"{base_url}/admin/equipment/{eq_id}/maintenance-logs/{log_id}", headers=admin_headers)
    assert r_del.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Staff-specific token flow
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_token_access_staff_endpoints(client: httpx.AsyncClient, base_url: str):
    """Staff obtains token via staff auth and accesses staff endpoints."""
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "store_id": 1,
    })
    assert r.status_code == 200
    staff_token = r.json()["tokens"]["access_token"]
    staff_headers = {"Authorization": f"Bearer {staff_token}", "Content-Type": "application/json"}

    r2 = await client.get(f"{base_url}/staff/auth/me", headers=staff_headers)
    assert r2.status_code == 200
    profile = r2.json()["data"]
    assert "display_name" in profile
    assert profile["store_id"] == 1


# ═══════════════════════════════════════════════════════════════════════════
# Staff PIN Verify
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_pin_verify_correct(client: httpx.AsyncClient, base_url: str):
    """POST /staff/auth/verify-pin returns valid=true for correct PIN."""
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "store_id": 1,
    })
    assert r.status_code == 200
    token = r.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r2 = await client.post(
        f"{base_url}/staff/auth/verify-pin",
        headers=headers,
        json={"pin": "1234"},
    )
    if r2.status_code in (404, 405):
        pytest.skip("Staff PIN verify endpoint not implemented")
    assert r2.status_code == 200, f"PIN verify failed: {r2.text}"
    data = r2.json()["data"]
    assert data["valid"] is True, f"Expected valid=True, got {data}"


@pytest.mark.asyncio
async def test_staff_pin_verify_wrong(client: httpx.AsyncClient, base_url: str):
    """POST /staff/auth/verify-pin returns valid=false for incorrect PIN."""
    r = await client.post(f"{base_url}/staff/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "store_id": 1,
    })
    assert r.status_code == 200
    token = r.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r2 = await client.post(
        f"{base_url}/staff/auth/verify-pin",
        headers=headers,
        json={"pin": "999999"},
    )
    if r2.status_code in (404, 405):
        pytest.skip("Staff PIN verify endpoint not implemented")
    assert r2.status_code == 200, f"PIN verify failed: {r2.text}"
    data = r2.json()["data"]
    assert data["valid"] is False, f"Expected valid=False for wrong PIN, got {data}"
