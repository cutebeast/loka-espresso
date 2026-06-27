"""E2E tests for admin push notifications and customer inbox."""

import uuid

import pytest
import httpx

pytestmark = [pytest.mark.admin, pytest.mark.customer]


@pytest.mark.asyncio
async def test_admin_notification_send_and_customer_inbox(
    client: httpx.AsyncClient,
    admin_headers: dict,
    customer_headers: dict,
    base_url: str,
):
    """Admin can create/send a notification; customer sees it in inbox and can mark read."""
    title = f"E2E Notification {uuid.uuid4().hex[:8]}"
    payload = {
        "title": title,
        "body": "This is a test notification from the E2E suite.",
        "notification_type": "general",
        "audience_segment": "all_users",
        "status": "draft",
    }
    r = await client.post(f"{base_url}/admin/notifications", headers=admin_headers, json=payload)
    assert r.status_code == 201, f"Notification create failed: {r.text}"
    notif_id = r.json()["data"]["id"]

    # Send
    r = await client.post(f"{base_url}/admin/notifications/{notif_id}/send", headers=admin_headers)
    assert r.status_code == 200, f"Notification send failed: {r.text}"
    assert r.json()["data"]["status"] == "sent"

    # Admin stats
    r = await client.get(f"{base_url}/admin/notifications/stats", headers=admin_headers)
    assert r.status_code == 200
    stats = r.json()["data"]
    assert stats["total_sent"] >= 1

    # Customer inbox contains the message
    r = await client.get(f"{base_url}/notifications/me", headers=customer_headers)
    assert r.status_code == 200
    messages = r.json()["data"]["items"]
    message = next((m for m in messages if m["title"] == title), None)
    assert message is not None, "Sent notification not found in customer inbox"

    # Mark read
    r = await client.patch(f"{base_url}/notifications/me/{message['id']}/read", headers=customer_headers)
    assert r.status_code == 200, f"Mark read failed: {r.text}"
    assert r.json()["data"]["is_read"] is True

    # Customer preferences (endpoint expects a list of preference objects)
    r = await client.put(
        f"{base_url}/notifications/preferences/me",
        headers=customer_headers,
        json=[{"channel": "push", "message_category": "promotions", "is_enabled": False}],
    )
    assert r.status_code == 200, f"Preferences update failed: {r.text}"

    # Cleanup admin notification
    r = await client.delete(f"{base_url}/admin/notifications/{notif_id}", headers=admin_headers)
    assert r.status_code in (200, 204)
