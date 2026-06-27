"""E2E tests for customer feedback submission and admin management."""

import pytest
import httpx

pytestmark = [pytest.mark.admin, pytest.mark.customer]


@pytest.mark.asyncio
async def test_feedback_submit_and_admin_reply(
    client: httpx.AsyncClient,
    admin_headers: dict,
    customer_headers: dict,
    base_url: str,
    store_id: int,
):
    """Customer submits feedback; admin can list, view stats and reply."""
    # Submit feedback as customer
    payload = {
        "store_id": store_id,
        "rating": 5,
        "title": "E2E Feedback",
        "body": "Everything was great during the E2E run.",
    }
    r = await client.post(f"{base_url}/feedback", headers=customer_headers, json=payload)
    assert r.status_code == 201, f"Feedback submit failed: {r.text}"
    feedback_id = r.json()["data"]["id"]

    # Admin list
    r = await client.get(f"{base_url}/admin/feedback?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert any(f["id"] == feedback_id for f in items)

    # Admin stats
    r = await client.get(f"{base_url}/admin/feedback/stats?store_id={store_id}", headers=admin_headers)
    assert r.status_code == 200
    stats = r.json()["data"]
    assert 1 <= stats["total_reviews"]
    assert 1 <= stats["average_rating"] <= 5

    # Admin reply
    reply_text = "Thank you for your feedback!"
    r = await client.post(f"{base_url}/admin/feedback/{feedback_id}/reply", headers=admin_headers, json={"admin_reply": reply_text})
    assert r.status_code == 200, f"Feedback reply failed: {r.text}"
    assert r.json()["data"]["admin_reply"] == reply_text
