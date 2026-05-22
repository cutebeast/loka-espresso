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


# ═══════════════════════════════════════════════════════════════════════════
# Staff Auth
# ═══════════════════════════════════════════════════════════════════════════

# Seeded admin credentials that work via the staff/auth/login admin fallback.
STAFF_ADMIN_EMAIL = "admin@lokaespresso.my"
STAFF_ADMIN_PASSWORD = "admin123"


@pytest.mark.asyncio
async def test_staff_login_success(client: httpx.AsyncClient, base_url: str):
    """Admin can log in via the staff endpoint with correct credentials."""
    payload = {"email": STAFF_ADMIN_EMAIL, "password": STAFF_ADMIN_PASSWORD, "store_id": 1}
    r = await client.post(f"{base_url}/staff/auth/login", json=payload)
    assert r.status_code == 200, f"Staff login failed: {r.text}"
    data = r.json()
    assert "tokens" in data
    assert "access_token" in data["tokens"]
    assert data["profile"]["store_id"] == 1


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
    # Orders may be empty if no orders have been placed yet


@pytest.mark.asyncio
async def test_staff_get_order_detail(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Staff/admin can get order detail."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=1", headers=admin_headers)
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No orders available")
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
    if not items:
        pytest.skip("No orders available")
    order_id = items[0]["id"]
    # Try updating status to confirmed
    r2 = await client.patch(f"{base_url}/admin/orders/{order_id}/status", headers=admin_headers, json={"status": "confirmed"})
    assert r2.status_code == 200


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
    if not items:
        pytest.skip("No equipment available")
    eq_id = items[0]["id"]

    log = {
        "equipment_id": eq_id,
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
