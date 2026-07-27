"""E2E tests for POS offline-mode idempotency (orders.client_ref).

The staff portal queues orders with a client-generated client_ref while
offline and replays them on sync. The backend must return the existing
order (HTTP 200, same id) instead of duplicating the sale.
"""

import uuid

import httpx
import pytest

from test_pos_sessions_merge import _pick_item


def _payload(menu_item_id: int, client_ref: str | None) -> dict:
    payload = {
        "order_type": "takeaway",
        "line_items": [{"menu_item_id": menu_item_id, "quantity": 1}],
    }
    if client_ref is not None:
        payload["client_ref"] = client_ref
    return payload


async def _order_ids(client: httpx.AsyncClient, base_url: str, staff_headers: dict) -> set[int]:
    r = await client.get(f"{base_url}/staff/orders?per_page=500", headers=staff_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    orders = data.get("items", data) if isinstance(data, dict) else data
    return {o["id"] for o in orders}


@pytest.mark.asyncio
async def test_pos_client_ref_idempotent_replay(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    item = await _pick_item(client, base_url)
    ref = f"e2e-offline-{uuid.uuid4()}"

    ids_before = await _order_ids(client, base_url, staff_headers)

    # First create → 201
    r = await client.post(f"{base_url}/staff/pos/orders", headers=staff_headers, json=_payload(item["id"], ref))
    assert r.status_code == 201, r.text
    first_id = r.json()["data"]["order_id"]

    # Replay same payload + ref → 200 with the SAME order id
    r = await client.post(f"{base_url}/staff/pos/orders", headers=staff_headers, json=_payload(item["id"], ref))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["order_id"] == first_id

    # Order list confirms the replay created NO second order: exactly one
    # new order appeared and it is the first one.
    ids_after = await _order_ids(client, base_url, staff_headers)
    assert ids_after - ids_before == {first_id}

    # Different ref → a new order id
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json=_payload(item["id"], f"e2e-offline-{uuid.uuid4()}"),
    )
    assert r.status_code == 201, r.text
    second_id = r.json()["data"]["order_id"]
    assert second_id != first_id

    # No ref at all → still works (201)
    r = await client.post(f"{base_url}/staff/pos/orders", headers=staff_headers, json=_payload(item["id"], None))
    assert r.status_code == 201, r.text
    assert r.json()["data"]["order_id"] not in (first_id, second_id)
