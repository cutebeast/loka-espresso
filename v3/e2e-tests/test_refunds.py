"""E2E tests for refund listing endpoint."""

import pytest
import httpx

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_list_refunds(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Refund list endpoint returns a paginated response."""
    r = await client.get(f"{base_url}/admin/refunds?store_id={store_id}&per_page=20", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert "total" in data
