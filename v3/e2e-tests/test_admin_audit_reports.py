"""E2E tests for audit log and dashboard/reports endpoints."""

import pytest
import httpx

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_dashboard_metrics(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Dashboard metrics endpoint returns KPI data for a store."""
    r = await client.get(f"{base_url}/admin/dashboard/metrics?store_id={store_id}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "store_count" in data or "today_orders" in data or "active_orders" in data


@pytest.mark.asyncio
async def test_audit_log_list(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Audit log can be listed and filtered by store."""
    r = await client.get(f"{base_url}/admin/audit-log?store_id={store_id}&per_page=10", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


@pytest.mark.asyncio
async def test_audit_log_detail(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """A single audit-log entry can be fetched by ID."""
    r = await client.get(f"{base_url}/admin/audit-log?store_id={store_id}&per_page=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No audit log entries available")

    log_id = items[0]["id"]
    r2 = await client.get(f"{base_url}/admin/audit-log/{log_id}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["data"]["id"] == log_id
