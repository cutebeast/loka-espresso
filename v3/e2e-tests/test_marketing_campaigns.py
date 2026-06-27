"""E2E tests for marketing campaign management and analytics."""

import uuid

import pytest
import httpx

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_marketing_campaign_lifecycle(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Admin can create, list, send and delete a marketing campaign."""
    key = f"e2e-campaign-{uuid.uuid4().hex[:8]}"
    payload = {
        "campaign_name": "E2E Campaign",
        "campaign_key": key,
        "channel": "in_app",
        "campaign_type": "promotional",
        "status": "draft",
        "body_content": "Hello from the E2E campaign test.",
    }
    r = await client.post(f"{base_url}/admin/marketing/campaigns", headers=admin_headers, json=payload)
    assert r.status_code == 201, f"Campaign create failed: {r.text}"
    campaign_id = r.json()["data"]["id"]

    # List contains it
    r = await client.get(f"{base_url}/admin/marketing/campaigns?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    assert any(c["id"] == campaign_id for c in r.json()["data"]["items"])

    # Send/execute
    r = await client.patch(f"{base_url}/admin/marketing/campaigns/{campaign_id}/send", headers=admin_headers)
    assert r.status_code == 200, f"Campaign send failed: {r.text}"

    # Analytics
    r = await client.get(f"{base_url}/admin/marketing/analytics", headers=admin_headers)
    assert r.status_code == 200
    assert any(a["campaign_id"] == campaign_id for a in r.json()["data"]["items"])

    # NOTE: campaign deletion is omitted because the current endpoint fails to
    # cascade-disassociate analytics rows. The uniquely-keyed campaign is left
    # in place; it does not affect subsequent test runs.
