"""E2E Test Suite: Inventory operations — suppliers and purchase orders."""

import pytest
import uuid
from datetime import datetime, timezone, timedelta

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_supplier_crud(
    client, admin_headers: dict, base_url: str, store_id: int
):
    """Create, read, update and soft-delete a supplier."""
    suffix = uuid.uuid4().hex[:8]
    name = f"E2E Supplier {suffix}"

    r_list = await client.get(
        f"{base_url}/admin/inventory/suppliers?store_id={store_id}&per_page=10",
        headers=admin_headers,
    )
    assert r_list.status_code == 200, f"List suppliers failed: {r_list.text}"

    r_create = await client.post(
        f"{base_url}/admin/inventory/suppliers",
        headers=admin_headers,
        json={
            "store_id": store_id,
            "supplier_name": name,
            "contact_person": "E2E Contact",
            "phone_number": "+60123456789",
            "email_address": f"e2e-{suffix}@example.com",
            "address": "123 Test Street",
            "lead_time_days": 5,
            "is_active": True,
        },
    )
    assert r_create.status_code in (200, 201), (
        f"Create supplier failed: {r_create.status_code}: {r_create.text}"
    )
    supplier = r_create.json().get("data", r_create.json())
    supplier_id = supplier["id"]
    assert supplier["supplier_name"] == name

    r_get = await client.get(
        f"{base_url}/admin/inventory/suppliers/{supplier_id}",
        headers=admin_headers,
    )
    assert r_get.status_code == 200
    assert r_get.json()["data"]["id"] == supplier_id

    r_update = await client.patch(
        f"{base_url}/admin/inventory/suppliers/{supplier_id}",
        headers=admin_headers,
        json={"phone_number": "+60987654321"},
    )
    assert r_update.status_code == 200
    assert r_update.json()["data"]["phone_number"] == "+60987654321"

    r_delete = await client.delete(
        f"{base_url}/admin/inventory/suppliers/{supplier_id}",
        headers=admin_headers,
    )
    assert r_delete.status_code in (200, 204)

    r_get2 = await client.get(
        f"{base_url}/admin/inventory/suppliers/{supplier_id}",
        headers=admin_headers,
    )
    assert r_get2.status_code == 404


@pytest.mark.asyncio
async def test_purchase_order_lifecycle(
    client, admin_headers: dict, base_url: str, store_id: int
):
    """Create a purchase order, receive it, and verify detail/list endpoints."""
    # Need a supplier for this store
    suffix = uuid.uuid4().hex[:8]
    r_sup = await client.post(
        f"{base_url}/admin/inventory/suppliers",
        headers=admin_headers,
        json={
            "store_id": store_id,
            "supplier_name": f"E2E PO Supplier {suffix}",
            "contact_person": "PO Contact",
            "phone_number": "+60111111111",
            "lead_time_days": 3,
        },
    )
    assert r_sup.status_code in (200, 201), f"Supplier create failed: {r_sup.text}"
    supplier_id = r_sup.json()["data"]["id"]

    # Need an inventory item
    r_items = await client.get(
        f"{base_url}/admin/inventory/items?per_page=1",
        headers=admin_headers,
    )
    assert r_items.status_code == 200
    items = r_items.json()["data"].get("items", [])
    if not items:
        pytest.skip("No inventory items seeded for PO test")
    item_id = items[0]["id"]

    expected = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    po_number = f"E2E-PO-{suffix}"
    r_create = await client.post(
        f"{base_url}/admin/inventory/purchase-orders",
        headers=admin_headers,
        json={
            "store_id": store_id,
            "supplier_id": supplier_id,
            "po_number": po_number,
            "expected_delivery": expected,
            "notes": "E2E purchase order",
            "lines": [
                {
                    "inventory_item_id": item_id,
                    "quantity_ordered": 10.0,
                    "unit_cost": 5.5,
                }
            ],
        },
    )
    assert r_create.status_code in (200, 201), (
        f"Create PO failed: {r_create.status_code}: {r_create.text}"
    )
    po = r_create.json()["data"]
    po_id = po["id"]
    assert po["status"] == "draft"
    assert po["supplier_id"] == supplier_id
    assert len(po.get("lines", [])) == 1
    assert po["lines"][0]["line_total"] == pytest.approx(55.0, 0.01)

    # List should include the new PO
    r_list = await client.get(
        f"{base_url}/admin/inventory/purchase-orders?store_id={store_id}&per_page=50",
        headers=admin_headers,
    )
    assert r_list.status_code == 200
    po_ids = [p["id"] for p in r_list.json()["data"].get("items", [])]
    assert po_id in po_ids

    # Receive full quantity (empty body triggers full receipt)
    r_receive = await client.patch(
        f"{base_url}/admin/inventory/purchase-orders/{po_id}/receive",
        headers=admin_headers,
        json={},
    )
    assert r_receive.status_code == 200, (
        f"Receive PO failed: {r_receive.status_code}: {r_receive.text}"
    )
    received = r_receive.json()["data"]
    assert received["status"] == "received"
    assert received["lines"][0]["quantity_received"] == pytest.approx(10.0, 0.01)

    # Detail endpoint
    r_detail = await client.get(
        f"{base_url}/admin/inventory/purchase-orders/{po_id}",
        headers=admin_headers,
    )
    assert r_detail.status_code == 200
    assert r_detail.json()["data"]["status"] == "received"
