"""E2E tests for audit log and dashboard/reports endpoints."""

import pytest
import httpx
import uuid

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
    # Create a staff member to generate an audit log entry.
    suffix = uuid.uuid4().hex[:8]
    r_create = await client.post(
        f"{base_url}/admin/staff",
        headers=admin_headers,
        json={
            "display_name": f"Audit Staff {suffix}",
            "email": f"audit-staff-{suffix}@test.com",
            "password": "TempPass123!",
            "pin": "1234",
            "role": "server",
            "store_id": store_id,
            "is_active": True,
        },
    )
    assert r_create.status_code in (200, 201), f"Staff creation failed: {r_create.text}"

    r = await client.get(f"{base_url}/admin/audit-log?resource_type=staff&per_page=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert items, "No audit log entries available after creating staff"

    log_id = items[0]["id"]
    r2 = await client.get(f"{base_url}/admin/audit-log/{log_id}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["data"]["id"] == log_id
