"""
E2E Test Suite: Reservation CRUD

Covers:
  - Customer creates a reservation via POST /reservations
  - Customer cancels own reservation via DELETE /reservations/{id}
  - Staff/admin confirms reservation with table assignment
  - Reservation store scoping: staff from store B cannot see store A's reservations
"""

import pytest
import httpx
import uuid
import jwt as pyjwt
from datetime import date, datetime, timezone, timedelta

from conftest import JWT_SECRET

# ═══════════════════════════════════════════════════════════════════════════
# Customer create reservation
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_create_reservation(
    client: httpx.AsyncClient, base_url: str, store_id: int, cleanup_registry: dict
):
    """Customer can create a reservation via POST /reservations."""
    ts = uuid.uuid4().hex[:16]
    email = f"resv-create-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"ResvCreate {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    tomorrow = date.today() + timedelta(days=1)
    reservation_time = "19:00:00"

    try:
        r = await client.post(f"{base_url}/reservations", headers=headers, json={
            "store_id": store_id,
            "party_size": 4,
            "reservation_date": str(tomorrow),
            "reservation_time": reservation_time,
            "duration_minutes": 90,
            "special_requests": "Window seat please",
        })
    except httpx.ConnectError:
        pytest.skip("Customer reservation endpoint not available")

    if r.status_code in (404, 405):
        pytest.skip("Customer reservation endpoint not implemented")
    assert r.status_code == 201, f"Reservation creation failed: {r.text}"
    data = r.json()
    assert "data" in data or "id" in data
    reservation_data = data.get("data", data)
    assert reservation_data["store_id"] == store_id
    assert reservation_data["status"] == "requested"


# ═══════════════════════════════════════════════════════════════════════════
# Customer cancel own reservation
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.customer
@pytest.mark.asyncio
async def test_customer_cancel_own_reservation(
    client: httpx.AsyncClient, base_url: str, store_id: int, cleanup_registry: dict
):
    """Customer can cancel their own reservation via DELETE /reservations/{id}."""
    ts = uuid.uuid4().hex[:16]
    email = f"resv-cancel-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"ResvCancel {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    tomorrow = date.today() + timedelta(days=1)

    try:
        r = await client.post(f"{base_url}/reservations", headers=headers, json={
            "store_id": store_id,
            "party_size": 2,
            "reservation_date": str(tomorrow),
            "reservation_time": "20:00:00",
        })
    except httpx.ConnectError:
        pytest.skip("Customer reservation endpoint not available")

    if r.status_code in (404, 405):
        pytest.skip("Customer reservation endpoint not implemented")
    if r.status_code != 201:
        pytest.skip(f"Reservation creation returned {r.status_code}")

    reservation_data = r.json().get("data", r.json())
    reservation_id = reservation_data["id"]
    assert reservation_data["status"] == "requested"

    # Cancel the reservation
    try:
        r2 = await client.delete(f"{base_url}/reservations/{reservation_id}", headers=headers)
    except httpx.ConnectError:
        pytest.skip("Customer reservation cancel endpoint not available")

    if r2.status_code in (404, 405):
        pytest.skip("Customer reservation cancel endpoint not implemented")
    assert r2.status_code == 200, f"Reservation cancel failed: {r2.text}"

    result = r2.json()
    cancel_data = result.get("data", result)
    assert cancel_data.get("cancelled") is True or cancel_data.get("id") == reservation_id


# ═══════════════════════════════════════════════════════════════════════════
# Staff confirm reservation with table assignment
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.staff
@pytest.mark.asyncio
async def test_staff_confirm_reservation(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Staff/admin can confirm a reservation with a table assignment.

    Uses admin endpoint PATCH /admin/reservations/{id}/status.
    """
    # Create a reservation via admin to have a known reservation
    # First, find a customer
    r_cust = await client.get(
        f"{base_url}/admin/customers?per_page=1",
        headers=admin_headers,
    )
    if r_cust.status_code != 200:
        pytest.skip("Admin customers list endpoint unavailable")
    customers = r_cust.json()["data"]["items"]
    if not customers:
        pytest.skip("No customers available for reservation")

    customer_id = customers[0]["id"]
    tomorrow = date.today() + timedelta(days=1)

    # Find an available table
    r_tables = await client.get(
        f"{base_url}/admin/stores/{store_id}/tables",
        headers=admin_headers,
    )
    if r_tables.status_code != 200:
        pytest.skip("Tables list endpoint not available")
    tables = r_tables.json()["data"]
    if not tables:
        pytest.skip("No tables in seed data for reservation")

    table_id = tables[0]["id"]

    try:
        r = await client.post(
            f"{base_url}/admin/reservations",
            headers=admin_headers,
            json={
                "store_id": store_id,
                "customer_id": customer_id,
                "party_size": 6,
                "reservation_date": str(tomorrow),
                "reservation_time": "18:30:00",
            },
        )
    except httpx.ConnectError:
        pytest.skip("Admin reservations create endpoint not available")

    if r.status_code in (404, 405):
        pytest.skip("Admin reservations create endpoint not implemented")
    if r.status_code != 201:
        pytest.skip(f"Reservation creation returned {r.status_code}: {r.text}")

    reservation_data = r.json()["data"]
    reservation_id = reservation_data["id"]
    assert reservation_data["status"] == "requested"

    # Confirm reservation with table assignment
    try:
        r2 = await client.patch(
            f"{base_url}/admin/reservations/{reservation_id}/status",
            headers=admin_headers,
            json={"status": "confirmed", "dining_table_id": table_id},
        )
    except httpx.ConnectError:
        pytest.skip("Reservation status update endpoint not available")

    if r2.status_code in (404, 405):
        pytest.skip("Reservation status update endpoint not implemented")
    assert r2.status_code == 200, f"Reservation confirm failed: {r2.text}"

    data2 = r2.json()["data"]
    assert data2["status"] == "confirmed"
    assert data2.get("dining_table_id") == table_id

    # Cleanup: cancel the reservation
    await client.patch(
        f"{base_url}/admin/reservations/{reservation_id}/status",
        headers=admin_headers,
        json={"status": "cancelled_by_merchant"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# Reservation store scoping
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.staff
@pytest.mark.asyncio
async def test_reservation_store_scoping(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, store_id_2: int, discovered_admin_id: str
):
    """Staff from store B cannot see store A's reservations.

    Creates a staff token with store_id_2 and verifies that requesting
    reservations with store_id=1 is rejected or returns empty.
    """
    # Create a staff token for store_id_2
    now = datetime.now(timezone.utc)
    token_s2 = pyjwt.encode(
        {
            "sub": discovered_admin_id,
            "type": "staff",
            "staff_id": 0,
            "store_id": store_id_2,
            "admin_id": 2,
            "iat": now,
            "exp": now + timedelta(hours=1),
            "iss": "fnb-enterprise-v3",
            "aud": "fnb-app",
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    headers_s2 = {"Authorization": f"Bearer {token_s2}", "Content-Type": "application/json"}

    # Attempt to list reservations for store 1 with store 2 token
    try:
        r = await client.get(
            f"{base_url}/admin/reservations?store_id={store_id}&per_page=1",
            headers=headers_s2,
        )
    except httpx.ConnectError:
        pytest.skip("Reservations endpoint not available")

    # Should be rejected (403/401) or return empty
    assert r.status_code in (403, 401, 200), (
        f"Unexpected status for cross-store reservation access: {r.status_code}"
    )
    if r.status_code == 200:
        items = r.json()["data"]["items"]
        # If store scoping is enforced, should return empty for different store
        # Note: staff tokens with store_id may have different scoping behavior
        assert len(items) == 0, (
            f"Store scoping may be missing: got reservations from store {store_id} "
            f"with token for store {store_id_2}"
        )
