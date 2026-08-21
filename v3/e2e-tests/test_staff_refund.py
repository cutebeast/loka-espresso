"""E2E: staff counter refund (round-40 gap — staff had no refund path)."""

import pytest


async def _cash_order(client, base_url, staff_headers):
    r = await client.get(f"{base_url}/staff/menu/items?store_id=1&per_page=500", headers=staff_headers)
    item = r.json()["data"][0]
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={
            "order_type": "takeaway",
            "line_items": [{"menu_item_id": item["id"], "quantity": 2}],
            "payment": {"method": "cash", "amount_tendered": 100.0},
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    return data.get("order_id") or data["id"]


@pytest.mark.asyncio
async def test_staff_refund_partial_and_full(client, base_url, staff_headers, admin_headers, store_id, cleanup_registry):
    order_id = await _cash_order(client, base_url, staff_headers)
    cleanup_registry["orders"].append({"id": order_id})
    r = await client.get(f"{base_url}/staff/orders/{order_id}", headers=staff_headers)
    total = float(r.json()["data"]["total_amount"])

    # partial refund
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/refund",
        headers=staff_headers,
        json={"amount": 5.0, "reason": "e2e partial refund", "reason_category": "customer_request"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["amount"] == "5.0000"

    # full refund of the remainder
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/refund",
        headers=staff_headers,
        json={"amount": round(total - 5.0, 2), "reason": "e2e full refund", "reason_category": "customer_request"},
    )
    assert r.status_code == 200, r.text

    # over-refund blocked
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/refund",
        headers=staff_headers,
        json={"amount": 1.0, "reason": "e2e over refund", "reason_category": "other"},
    )
    assert r.status_code == 400, r.text

    # admin sees both refunds
    r = await client.get(f"{base_url}/admin/refunds?per_page=10", headers=admin_headers)
    refs = (r.json().get("data") or {}).get("items", [])
    reasons = [x["reason"] for x in refs]
    assert "e2e full refund" in reasons and "e2e partial refund" in reasons


@pytest.mark.asyncio
async def test_staff_refund_requires_captured_payment(client, base_url, staff_headers, store_id, cleanup_registry):
    """Refunding an unpaid order is rejected cleanly."""
    r = await client.get(f"{base_url}/staff/menu/items?store_id=1&per_page=500", headers=staff_headers)
    item = r.json()["data"][0]
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": item["id"], "quantity": 1}]},
    )
    order_id = r.json()["data"].get("order_id") or r.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/refund",
        headers=staff_headers,
        json={"amount": 1.0, "reason": "e2e unpaid refund attempt", "reason_category": "other"},
    )
    assert r.status_code == 400, r.text
    assert "no captured payment" in r.text
