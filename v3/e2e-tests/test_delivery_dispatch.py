"""E2E tests for the manual delivery dispatch workflow.

Staff key delivery orders into external delivery systems (Lalamove etc.) and
record the provider + booking reference from the staff portal — this is the
manual path until a delivery-provider API integration lands.
"""

import uuid

import httpx
import pytest

from conftest import _get_database_url


def _staff_login(client: httpx.AsyncClient, base_url: str) -> dict:
    import time
    r = client.post(
        f"{base_url}/staff/auth/login",
        json={"email": "staff1@loyaltysystem.uk", "password": "staff123", "store_id": 1},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["tokens"]["access_token"] if "tokens" in body else body["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _create_delivery_order(client, base_url, store_id) -> dict:
    """Register a customer, add an item, place a delivery order."""
    ts = "".join(c for c in uuid.uuid4().hex if c.isdigit())[:8]
    phone = f"+6017{ts}"
    r = await client.post(f"{base_url}/auth/send-otp", json={"phone_number": phone})
    r = await client.post(f"{base_url}/auth/login", json={"phone_number": phone, "otp_code": "000000"})
    assert r.status_code == 200, r.text
    token = r.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    item = r.json()["data"]["items"][0]
    r = await client.get(f"{base_url}/cart?store_id={store_id}", headers=headers)
    cart_id = r.json()["data"]["id"]
    r = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=headers,
        json={"menu_item_id": item["id"], "quantity": 1, "selected_modifiers": []},
    )
    assert r.status_code == 200
    r = await client.post(
        f"{base_url}/orders",
        headers=headers,
        json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": "delivery",
            "fulfillment_type": "standard_delivery",
            "delivery_address": {"address": "1 Jalan Test, Kuala Lumpur"},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]


@pytest.mark.asyncio
async def test_staff_delivery_dispatch_roundtrip(
    client: httpx.AsyncClient,
    base_url: str,
    staff_headers: dict,
    store_id: int,
    cleanup_registry: dict,
):
    """Dispatch records provider+ref; re-dispatch updates it; list + detail
    expose the fields; non-delivery orders are rejected."""
    order = await _create_delivery_order(client, base_url, store_id)
    order_id = order["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Non-delivery order → 400
    item = (await client.get(f"{base_url}/menu/stores/{store_id}")).json()["data"]["items"][0]
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": item["id"], "quantity": 1}]},
    )
    assert r.status_code == 201, r.text
    pos_order_id = r.json()["data"].get("order_id") or r.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": pos_order_id})
    r = await client.post(
        f"{base_url}/staff/orders/{pos_order_id}/delivery-dispatch",
        headers=staff_headers,
        json={"provider": "lalamove", "external_ref": "LAL-TEST"},
    )
    assert r.status_code == 400, r.text

    # Dispatch the real delivery order
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/delivery-dispatch",
        headers=staff_headers,
        json={"provider": "lalamove", "external_ref": "LAL-0001"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["provider"] == "lalamove"
    assert data["external_ref"] == "LAL-0001"
    assert data["dispatched_at"] is not None

    # Detail exposes the fields
    r = await client.get(f"{base_url}/staff/orders/{order_id}", headers=staff_headers)
    detail = r.json()["data"]
    assert detail["delivery_provider"] == "lalamove"
    assert detail["delivery_provider_order_id"] == "LAL-0001"

    # Re-key (idempotent update) with another provider/ref
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/delivery-dispatch",
        headers=staff_headers,
        json={"provider": "grab_express", "external_ref": "GE-9999"},
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"{base_url}/staff/orders/{order_id}", headers=staff_headers)
    detail = r.json()["data"]
    assert detail["delivery_provider"] == "grab_express"
    assert detail["delivery_provider_order_id"] == "GE-9999"

    # Invalid provider → 422 (Literal)
    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/delivery-dispatch",
        headers=staff_headers,
        json={"provider": "grabpay", "external_ref": "X"},
    )
    assert r.status_code == 422, r.text

    # The list exposes dispatch info for the order (pending orders are only
    # in the queue via an explicit status filter — the default view is live
    # kitchen orders)
    r = await client.get(f"{base_url}/staff/orders?timeframe=all&status=pending", headers=staff_headers)
    rows = [o for o in r.json()["data"] if o["id"] == order_id]
    assert rows and rows[0]["delivery_provider"] == "grab_express"

    # Cancel cleanup
    await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})


@pytest.mark.asyncio
async def test_staff_delivery_dispatch_advances_paid_order(
    client: httpx.AsyncClient,
    base_url: str,
    staff_headers: dict,
    admin_headers: dict,
    store_id: int,
    cleanup_registry: dict,
):
    """A PAID delivery order advances confirmed → out_for_delivery on dispatch."""
    order = await _create_delivery_order(client, base_url, store_id)
    order_id = order["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Pay at the counter (admin cash capture advances pending → confirmed)
    r = await client.patch(
        f"{base_url}/admin/orders/{order_id}/payment",
        headers=admin_headers,
        json={"payment_method": "cash", "amount_tendered": float(order["total_amount"])},
    )
    assert r.status_code == 200, r.text

    r = await client.post(
        f"{base_url}/staff/orders/{order_id}/delivery-dispatch",
        headers=staff_headers,
        json={"provider": "in_house", "external_ref": "RIDER-7"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "out_for_delivery"
    assert r.json()["data"]["status_advanced"] is True
