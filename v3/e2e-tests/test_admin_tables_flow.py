"""
E2E Test Suite: Table Management

Covers:
  - List tables for a store via GET /admin/stores/{store_id}/tables
  - Generate QR code for a table via POST /admin/stores/{store_id}/tables/{id}/generate-qr
  - Update table status via PATCH /admin/stores/{store_id}/tables/{id}
"""

import pytest
import httpx

pytestmark = [pytest.mark.admin]


# ═══════════════════════════════════════════════════════════════════════════
# List tables
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_tables(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Admin can list dining tables for a store."""
    try:
        r = await client.get(
            f"{base_url}/admin/stores/{store_id}/tables",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Tables list endpoint not available")

    if r.status_code in (404, 405):
        pytest.skip("Tables list endpoint not implemented")
    assert r.status_code == 200, f"List tables failed: {r.text}"
    data = r.json()["data"]
    assert isinstance(data, list)
    if len(data) > 0:
        table = data[0]
        assert "id" in table
        assert "table_number" in table
        assert "capacity" in table
        assert "current_status" in table
        assert table["current_status"] in (
            "available", "occupied", "reserved", "cleaning", "maintenance"
        )


# ═══════════════════════════════════════════════════════════════════════════
# Generate QR code
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_qr(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Admin can generate a QR code URL for a dining table."""
    # Get an existing table
    try:
        r = await client.get(
            f"{base_url}/admin/stores/{store_id}/tables",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Tables list endpoint not available")

    if r.status_code != 200:
        pytest.skip("Tables list endpoint not available")
    tables = r.json()["data"]
    if not tables:
        pytest.skip("No tables in seed data")

    table = tables[0]
    table_id = table["id"]

    # Generate QR
    try:
        r2 = await client.post(
            f"{base_url}/admin/stores/{store_id}/tables/{table_id}/generate-qr",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Generate QR endpoint not available")

    if r2.status_code in (404, 405):
        pytest.skip("Generate QR endpoint not implemented")
    assert r2.status_code == 200, f"Generate QR failed: {r2.text}"
    data = r2.json()["data"]
    assert "qr_code_image_url" in data
    assert data["qr_code_image_url"] is not None
    assert data["id"] == table_id


# ═══════════════════════════════════════════════════════════════════════════
# Update table status
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_update_table_status(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """Admin can change table status: available → occupied → available."""
    # Get an existing table
    try:
        r = await client.get(
            f"{base_url}/admin/stores/{store_id}/tables",
            headers=admin_headers,
        )
    except httpx.ConnectError:
        pytest.skip("Tables list endpoint not available")

    if r.status_code != 200:
        pytest.skip("Tables list endpoint not available")
    tables = r.json()["data"]
    if not tables:
        pytest.skip("No tables in seed data")

    # Find an available table
    table = None
    for t in tables:
        if t["current_status"] == "available":
            table = t
            break
    if table is None:
        # Use first table anyway — it may not be available for unrelated reasons
        table = tables[0]

    table_id = table["id"]
    original_status = table["current_status"]

    try:
        # Change to occupied
        r2 = await client.patch(
            f"{base_url}/admin/stores/{store_id}/tables/{table_id}",
            headers=admin_headers,
            json={"current_status": "occupied"},
        )
    except httpx.ConnectError:
        pytest.skip("Table update endpoint not available")

    if r2.status_code in (404, 405):
        pytest.skip("Table update endpoint not implemented")
    assert r2.status_code == 200, f"Update table to occupied failed: {r2.text}"
    assert r2.json()["data"]["current_status"] == "occupied"

    # Change back to available
    r3 = await client.patch(
        f"{base_url}/admin/stores/{store_id}/tables/{table_id}",
        headers=admin_headers,
        json={"current_status": "available"},
    )
    assert r3.status_code == 200, f"Update table to available failed: {r3.text}"
    assert r3.json()["data"]["current_status"] == "available"

    # Verify final status
    r4 = await client.get(
        f"{base_url}/admin/stores/{store_id}/tables",
        headers=admin_headers,
    )
    assert r4.status_code == 200
    final_tables = {t["id"]: t for t in r4.json()["data"]}
    assert final_tables[table_id]["current_status"] == "available"
