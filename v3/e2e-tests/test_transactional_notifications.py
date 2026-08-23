"""E2E: transactional notifications engine.

Covers: welcome (template-driven), order status transitions, cancellation,
voucher grants, wallet top-up, and the admin send log. Assumes the 17 event
templates are seeded (scripts/seed_transactional_templates.py).
"""

import uuid

import httpx
import pytest


async def _register(client, base_url, cleanup_registry):
    email = f"e2e-notif-{uuid.uuid4().hex[:8]}@test.com"
    r = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": "Notif Tester",
        "device_fingerprint": f"e2e-notif-{uuid.uuid4().hex[:8]}",
    })
    assert r.status_code in (200, 201), r.text
    data = r.json()
    if cleanup_registry is not None:
        cleanup_registry["customers"].append({"id": data["user_id"]})
    return {
        "id": data["user_id"],
        "headers": {"Authorization": f"Bearer {data['tokens']['access_token']}"},
    }


async def _inbox(client, base_url, cust):
    r = await client.get(f"{base_url}/notifications/me", headers=cust["headers"])
    assert r.status_code == 200, r.text
    return r.json()["data"]["items"]


@pytest.mark.asyncio
async def test_welcome_and_voucher_grant_notifications(client, base_url, admin_headers, cleanup_registry):
    cust = await _register(client, base_url, cleanup_registry)
    items = await _inbox(client, base_url, cust)
    # Registration grants the welcome voucher (voucher_granted) + the welcome
    # summary message. Template order is voucher first, then welcome.
    keys = [m.get("title", "") for m in items]
    assert any("voucher" in k.lower() or "gift" in k.lower() for k in keys), keys
    assert any("welcome" in k.lower() for k in keys), keys


@pytest.mark.asyncio
async def test_order_status_and_cancel_notifications(
    client, base_url, admin_headers, staff_headers, store_id, cleanup_registry
):
    cust = await _register(client, base_url, cleanup_registry)
    # POS order for the customer (paid-now path) — staff then advance status.
    menu = (await client.get(f"{base_url}/menu/items", params={"limit": 3})).json()["data"]["items"]
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={
            "order_type": "takeaway",
            "customer_id": cust["id"],
            "line_items": [{"menu_item_id": menu[0]["id"], "quantity": 1}],
        },
    )
    assert r.status_code in (200, 201), r.text
    order_id = r.json()["data"]["order_id"]
    cleanup_registry["orders"].append({"id": order_id})

    # preparing → order_preparing message
    r = await client.patch(f"{base_url}/staff/orders/{order_id}/status", headers=staff_headers,
                           params={"status": "preparing"})
    assert r.status_code == 200, r.text
    # ready → order_ready message (high priority)
    r = await client.patch(f"{base_url}/staff/orders/{order_id}/status", headers=staff_headers,
                           params={"status": "ready_for_pickup"})
    assert r.status_code == 200, r.text
    # cancel → order_cancelled message
    r = await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers)
    assert r.status_code == 200, r.text

    items = await _inbox(client, base_url, cust)
    bodies = " | ".join((m.get("body") or "") + " " + (m.get("title") or "") for m in items)
    assert "prepared" in bodies or "preparing" in bodies.lower()
    assert "ready" in bodies.lower()
    assert "cancelled" in bodies.lower() or "cancel" in bodies.lower()


@pytest.mark.asyncio
async def test_wallet_topup_notification_and_send_log(
    client, base_url, admin_headers, cleanup_registry
):
    cust = await _register(client, base_url, cleanup_registry)
    r = await client.post(
        f"{base_url}/wallet/topup/checkout",
        headers=cust["headers"],
        json={"amount": 20, "provider": "stripe", "return_url": "http://x/#wallet"},
    )
    assert r.status_code in (200, 201), r.text
    session_id = r.json()["data"]["session_id"]
    # Complete through the dev simulator (form-encoded like the simulator page).
    r2 = await client.post(
        f"{base_url}/wallet/topup/simulator/complete",
        data={"session_id": session_id, "action": "pay"},
    )
    assert r2.status_code in (200, 303), r2.text

    items = await _inbox(client, base_url, cust)
    assert any(("topped up" in (m.get("title") or "").lower()) or ("added" in (m.get("body") or "").lower()) for m in items), items

    # Admin send log lists the events.
    r3 = await client.get(f"{base_url}/admin/notifications/events-log", headers=admin_headers)
    assert r3.status_code == 200, r3.text
    events = r3.json()["data"]["items"]
    assert any(e["event_key"] == "wallet_topup" for e in events)


@pytest.mark.asyncio
async def test_events_registry_and_preferences_endpoints(client, base_url, admin_headers):
    r = await client.get(f"{base_url}/admin/notifications/events", headers=admin_headers)
    assert r.status_code == 200, r.text
    keys = [e["event_key"] for e in r.json()["data"]]
    for expected in ("welcome", "order_ready", "voucher_granted", "wallet_topup"):
        assert expected in keys

    cust = await _register(client, base_url, None)
    # Preference round-trip (opt-out of promotional push).
    r2 = await client.put(
        f"{base_url}/notifications/preferences/me",
        headers=cust["headers"],
        json=[{"channel": "push_notification", "message_category": "promotions", "is_enabled": False}],
    )
    assert r2.status_code == 200, r2.text
    r3 = await client.get(f"{base_url}/notifications/preferences/me", headers=cust["headers"])
    prefs = r3.json()["data"]
    row = next((p for p in prefs if p["channel"] == "push_notification" and p["message_category"] == "promotions"), None)
    assert row is not None and row["is_enabled"] is False
