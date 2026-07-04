"""E2E tests for the admin-configurable accounting precision settings."""

import pytest
import httpx

pytestmark = [pytest.mark.admin]


@pytest.mark.asyncio
async def test_accounting_precision_config_exists(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    """The accounting precision and rounding-mode keys are exposed via admin config."""
    r = await client.get(f"{base_url}/admin/config?prefix=accounting.", headers=admin_headers)
    assert r.status_code == 200, f"Config list failed: {r.text}"
    items = r.json()["data"]
    keys = {c["config_key"] for c in items}
    assert "accounting.decimal_places" in keys
    assert "accounting.rounding_mode" in keys


@pytest.mark.asyncio
async def test_accounting_rounding_mode_is_editable(client: httpx.AsyncClient, base_url: str, admin_headers: dict):
    """Admins can change the accounting rounding mode via the config endpoint."""
    # Capture original value so we can restore it after the test.
    r_orig = await client.get(f"{base_url}/admin/config?key=accounting.rounding_mode", headers=admin_headers)
    original_value = "ROUND_HALF_UP"
    if r_orig.status_code == 200:
        items = r_orig.json().get("data") or []
        if items:
            original_value = items[0].get("config_value", original_value)

    try:
        r = await client.put(
            f"{base_url}/admin/config?key=accounting.rounding_mode&value=ROUND_HALF_UP",
            headers=admin_headers,
        )
        assert r.status_code == 200, f"Config update failed: {r.text}"
        data = r.json()["data"]
        assert data["config_key"] == "accounting.rounding_mode"
        assert data["config_value"] == "ROUND_HALF_UP"
    finally:
        await client.put(
            f"{base_url}/admin/config?key=accounting.rounding_mode&value={original_value}",
            headers=admin_headers,
        )
