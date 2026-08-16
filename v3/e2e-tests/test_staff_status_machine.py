"""E2E tests for the round-37 staff order status machine.

Covers: monotonic transitions, terminal-state closure (no resurrection),
and the round-38 same-status no-op idempotency (double-tap / timeout retry).
"""

import httpx
import pytest


async def _pick_item(client: httpx.AsyncClient, base_url: str):
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["data"]["items"] if not str(i.get("item_code", "")).startswith("EX-") and float(i.get("base_price") or i.get("price") or 0) > 0)
    return item


async def _create_pos_order(client: httpx.AsyncClient, base_url: str, staff_headers: dict, menu_item_id: int) -> int:
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": menu_item_id, "quantity": 1}]},
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    return data.get("order_id") or data["id"]


@pytest.mark.asyncio
async def test_staff_status_machine_monotonic_and_terminal(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    """confirmed→preparing→ready_for_pickup→delivered; no jumps; no
    resurrection; same-status PATCH is a 200 no-op."""
    item = await _pick_item(client, base_url)
    order_id = await _create_pos_order(client, base_url, staff_headers, item["id"])

    async def patch(status_value: str):
        return await client.patch(
            f"{base_url}/staff/orders/{order_id}/status",
            headers=staff_headers,
            params={"status": status_value, "reason": "e2e"},
        )

    try:
        # Legitimate progression
        r = await patch("preparing")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "preparing"

        # Same-status double-tap → no-op 200 (round-38 idempotency)
        r = await patch("preparing")
        assert r.status_code == 200, r.text
        assert r.json()["data"].get("unchanged") is True

        # Forbidden jump: preparing → delivered skips the pickup stage
        r = await patch("delivered")
        assert r.status_code == 400, r.text

        r = await patch("ready_for_pickup")
        assert r.status_code == 200, r.text
        r = await patch("delivered")
        assert r.status_code == 200, r.text

        # Terminal: no resurrection, no further moves
        r = await patch("confirmed")
        assert r.status_code == 400, r.text
        r = await patch("preparing")
        assert r.status_code == 400, r.text

        # Invalid status value rejected
        r = await patch("shipped")
        assert r.status_code == 400, r.text

        # Cancelled-by-PATCH is rejected (use the cancel endpoint)
        r = await patch("cancelled_by_merchant")
        assert r.status_code == 400, r.text
    finally:
        await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})


@pytest.mark.asyncio
async def test_staff_status_machine_pending_to_confirmed_only(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    """A pending (unpaid Stripe-QR style) order can only advance to confirmed
    via the machine — staff can't push it straight to the kitchen unpaid."""
    item = await _pick_item(client, base_url)
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={
            "order_type": "takeaway",
            "line_items": [{"menu_item_id": item["id"], "quantity": 1}],
            "payment": {"method": "stripe_qr"},
        },
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["data"].get("order_id") or r.json()["data"]["id"]

    try:
        r = await client.get(f"{base_url}/staff/orders/{order_id}", headers=staff_headers)
        assert r.json()["data"]["status"] == "pending"

        # Jumping straight to the kitchen is rejected
        r = await client.patch(
            f"{base_url}/staff/orders/{order_id}/status",
            headers=staff_headers,
            params={"status": "preparing", "reason": "e2e"},
        )
        assert r.status_code == 400, r.text

        # pending → confirmed is allowed (counter payment advances via capture too)
        r = await client.patch(
            f"{base_url}/staff/orders/{order_id}/status",
            headers=staff_headers,
            params={"status": "confirmed", "reason": "e2e"},
        )
        assert r.status_code == 200, r.text
    finally:
        await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})
