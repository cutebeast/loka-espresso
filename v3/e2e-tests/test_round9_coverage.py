"""E2E Test Suite: Staff Shift Management — CRUD operations.

Covers: Create, list, update, delete staff shifts.
"""

import pytest
import httpx
import uuid
from datetime import datetime, timezone, timedelta

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_staff_shift_crud(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Full CRUD lifecycle for staff shifts.

    Steps:
    1. List existing shifts to verify GET endpoint
    2. Create a new shift
    3. Verify shift appears in listing
    4. Delete the shift
    5. Verify shift is removed
    """
    # 1. List existing shifts
    r_list = await client.get(
        f"{base_url}/admin/staff/shifts?store_id={store_id}&per_page=10",
        headers=admin_headers,
    )
    assert r_list.status_code == 200, f"List shifts failed: {r_list.status_code}: {r_list.text}"
    data = r_list.json()["data"]
    shifts_before = data.get("items", [])
    initial_count = len(shifts_before)

    # 2. Find an active staff member
    r_staff = await client.get(
        f"{base_url}/admin/staff?store_id={store_id}&per_page=1",
        headers=admin_headers,
    )
    if r_staff.status_code != 200:
        pytest.skip("Staff listing not available")
    staff_items = r_staff.json().get("data", {}).get("items", [])
    if not staff_items:
        pytest.skip("No staff members seeded for shift test")
    staff_id = staff_items[0]["id"]

    # 3. Create a shift for tomorrow
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    shift_payload = {
        "staff_id": staff_id,
        "store_id": store_id,
        "shift_date": tomorrow.isoformat(),
        "start_time": "08:00:00",
        "end_time": "16:00:00",
        "shift_type": "morning",
        "notes": "E2E test shift",
    }
    r_create = await client.post(
        f"{base_url}/admin/staff/shifts",
        headers=admin_headers,
        json=shift_payload,
    )
    if r_create.status_code == 404:
        pytest.skip("Staff shifts CRUD endpoint not implemented")
    assert r_create.status_code in (200, 201), (
        f"Create shift failed: {r_create.status_code}: {r_create.text}"
    )
    created = r_create.json().get("data", r_create.json())
    shift_id = created.get("id")
    assert shift_id is not None, f"No shift ID in response: {r_create.json()}"

    # 4. Verify shift appears in listing
    r_list2 = await client.get(
        f"{base_url}/admin/staff/shifts?store_id={store_id}&per_page=50",
        headers=admin_headers,
    )
    assert r_list2.status_code == 200
    shifts_after = r_list2.json()["data"].get("items", [])
    assert len(shifts_after) >= initial_count + 1, "Shift count did not increase after creation"
    created_in_list = [s for s in shifts_after if s.get("id") == shift_id]
    assert len(created_in_list) == 1, f"Created shift {shift_id} not found in listing"

    # 5. Update shift time
    r_update = await client.patch(
        f"{base_url}/admin/staff/{staff_id}/shifts/{shift_id}",
        headers=admin_headers,
        json={"end_time": "18:00:00"},
    )
    assert r_update.status_code == 200, f"Update shift failed: {r_update.status_code}: {r_update.text}"

    # 6. Delete the shift
    r_delete = await client.delete(
        f"{base_url}/admin/staff/shifts/{shift_id}",
        headers=admin_headers,
    )
    assert r_delete.status_code in (200, 204), (
        f"Delete shift failed: {r_delete.status_code}: {r_delete.text}"
    )

    # 7. Verify shift is removed
    r_list3 = await client.get(
        f"{base_url}/admin/staff/shifts?store_id={store_id}&per_page=50",
        headers=admin_headers,
    )
    assert r_list3.status_code == 200
    shifts_final = r_list3.json()["data"].get("items", [])
    deleted_in_list = [s for s in shifts_final if s.get("id") == shift_id]
    assert len(deleted_in_list) == 0, f"Shift {shift_id} still present after deletion"


@pytest.mark.asyncio
async def test_kds_order_display(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Kitchen Display System — verify orders appear and can be filtered.

    Steps:
    1. Create an order
    2. Verify order appears in KDS listing
    3. Verify KDS can filter by status
    """
    # 1. Find a menu item and customer for order creation
    r_menu = await client.get(
        f"{base_url}/admin/menu/items?per_page=1",
        headers=admin_headers,
    )
    if r_menu.status_code != 200:
        pytest.skip("Menu items not available")
    menu_items = r_menu.json()["data"].get("items", [])
    if not menu_items:
        pytest.skip("No menu items seeded")
    menu_item_id = menu_items[0]["id"]

    # Create a test customer
    ts = uuid.uuid4().hex[:8]
    r_reg = await client.post(
        f"{base_url}/auth/register",
        json={
            "phone_number": f"+601999{ts[:5]}",
            "display_name": f"KDS Test {ts}",
        },
    )
    assert r_reg.status_code in (200, 201), f"Register failed: {r_reg.status_code}"
    cust_data = r_reg.json()
    cust_token = cust_data["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {cust_token}", "Content-Type": "application/json"}

    # Add item to cart and create order
    await client.post(
        f"{base_url}/cart/items",
        headers=cust_headers,
        json={"menu_item_id": menu_item_id, "quantity": 2},
    )
    r_order = await client.post(
        f"{base_url}/orders",
        headers=cust_headers,
        json={"store_id": store_id, "order_type": "dine_in", "fulfillment_type": "dine_in"},
    )
    assert r_order.status_code in (200, 201), f"Order creation failed: {r_order.status_code}"
    order_data = r_order.json()["data"]
    order_id = order_data["id"]
    order_number = order_data.get("order_number", f"#{order_id}")

    # 2. Admin confirms the order so it appears in KDS
    await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "confirmed"},
    )

    # 3. Verify order appears in KDS listing for the store
    r_kds = await client.get(
        f"{base_url}/admin/orders?store_id={store_id}&status=confirmed&per_page=10",
        headers=admin_headers,
    )
    assert r_kds.status_code == 200, f"KDS listing failed: {r_kds.status_code}"
    kds_items = r_kds.json()["data"].get("items", [])
    kds_order_ids = [o["id"] for o in kds_items]
    assert order_id in kds_order_ids, (
        f"Order {order_number} (id={order_id}) not in KDS listing. Found: {kds_order_ids}"
    )

    # 4. Update order to preparing
    r_prep = await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "preparing"},
    )
    assert r_prep.status_code == 200, f"Status update to preparing failed: {r_prep.status_code}"

    # 5. Verify order appears with new status
    r_kds2 = await client.get(
        f"{base_url}/admin/orders?store_id={store_id}&status=preparing&per_page=10",
        headers=admin_headers,
    )
    assert r_kds2.status_code == 200
    kds_items2 = r_kds2.json()["data"].get("items", [])
    kds_order_ids2 = [o["id"] for o in kds_items2]
    assert order_id in kds_order_ids2, (
        f"Order {order_number} (id={order_id}) not in preparing KDS listing"
    )

    # 6. Mark as ready for pickup
    r_ready = await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "ready_for_pickup"},
    )
    assert r_ready.status_code == 200, f"Status update to ready failed: {r_ready.status_code}"
