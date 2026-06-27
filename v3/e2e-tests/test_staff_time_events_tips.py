"""E2E tests for staff time events and tip allocations."""

import pytest
import httpx

pytestmark = [pytest.mark.staff, pytest.mark.admin]


async def _get_menu_item_id(client: httpx.AsyncClient, base_url: str, store_id: int, item_code: str = "ESP") -> int:
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r.status_code == 200
    for item in r.json()["data"]["items"]:
        if item["item_code"] == item_code:
            return item["id"]
    raise RuntimeError(f"Menu item {item_code} not found")


async def _create_pos_order(client: httpx.AsyncClient, staff_headers: dict, base_url: str, store_id: int, menu_item_id: int) -> int:
    payload = {
        "store_id": store_id,
        "order_type": "dine_in",
        "line_items": [{"menu_item_id": menu_item_id, "quantity": 1}],
        "payment": {"method": "cash", "amount_tendered": 10.00},
    }
    r = await client.post(f"{base_url}/staff/pos/orders", headers=staff_headers, json=payload)
    assert r.status_code == 201, f"POS order creation failed: {r.text}"
    return r.json()["data"]["order_id"]


async def _get_test_staff_id(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int) -> int:
    r = await client.get(f"{base_url}/admin/staff?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    for s in r.json()["data"]["items"]:
        if s["display_name"] == "Test Staff":
            return s["id"]
    raise RuntimeError("Test Staff not found")


@pytest.mark.asyncio
async def test_staff_clock_event_and_admin_verification(
    client: httpx.AsyncClient,
    admin_headers: dict,
    staff_headers: dict,
    base_url: str,
    store_id: int,
):
    """Staff can clock in; admin can list and verify the time event."""
    r = await client.post(
        f"{base_url}/staff/time-events?event_type=clock_in",
        headers=staff_headers,
    )
    assert r.status_code == 201, f"Clock-in failed: {r.text}"
    event_id = r.json()["data"]["id"]

    # Staff sees own events
    r = await client.get(f"{base_url}/staff/time-events/me", headers=staff_headers)
    assert r.status_code == 200
    assert any(e["id"] == event_id for e in r.json()["data"]["items"])

    # Admin lists and verifies
    r = await client.get(f"{base_url}/admin/staff/time-events?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    assert any(e["id"] == event_id for e in r.json()["data"]["items"])

    r = await client.patch(
        f"{base_url}/admin/staff/time-events/{event_id}/verify",
        headers=admin_headers,
        json={"approved": True, "notes": "Verified via E2E"},
    )
    assert r.status_code == 200, f"Time event verify failed: {r.text}"
    assert r.json()["data"]["approved_by"] is not None


@pytest.mark.asyncio
async def test_tip_allocation_lifecycle(
    client: httpx.AsyncClient,
    admin_headers: dict,
    staff_headers: dict,
    base_url: str,
    store_id: int,
):
    """Admin can allocate a tip against a POS order and retrieve it."""
    menu_item_id = await _get_menu_item_id(client, base_url, store_id)
    order_id = await _create_pos_order(client, staff_headers, base_url, store_id, menu_item_id)
    staff_id = await _get_test_staff_id(client, admin_headers, base_url, store_id)

    payload = {
        "order_id": order_id,
        "staff_id": staff_id,
        "tip_amount": 2.00,
        "allocation_type": "even_split",
    }
    r = await client.post(f"{base_url}/admin/staff/tips", headers=admin_headers, json=payload)
    assert r.status_code == 201, f"Tip allocation failed: {r.text}"
    tip_id = r.json()["data"]["id"]

    r = await client.get(f"{base_url}/admin/staff/tips/{tip_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["data"]["tip_amount"] == 2.00

    r = await client.get(f"{base_url}/admin/staff/tips?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    assert any(t["id"] == tip_id for t in r.json()["data"]["items"])
