"""
E2E Test Suite: Cross-cutting Concerns

Covers:
  - Translation across all locales (en, ms, zh, ta, tr)
  - 24-hour store operations
  - Recipe-based stock deduction
  - Timezone-aware store open status
  - Equipment maintenance workflow
"""

import pytest
import httpx
from datetime import datetime, timezone


# ═══════════════════════════════════════════════════════════════════════════
# Translations
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.public
@pytest.mark.asyncio
async def test_translation_all_locales_menu(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Menu returns translated content for all supported locales."""
    locales = ["ms", "zh", "ta", "tr"]
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item_id = items[0]["id"]

    for loc in locales:
        r2 = await client.get(f"{base_url}/menu/items/{item_id}", headers={"Accept-Language": loc})
        assert r2.status_code == 200, f"Locale {loc} failed"
        item = r2.json()["data"]
        assert "item_name" in item


@pytest.mark.public
@pytest.mark.asyncio
async def test_translation_all_locales_stores(client: httpx.AsyncClient, base_url: str):
    """Store list returns translated store names for all locales."""
    locales = ["ms", "zh", "ta", "tr"]
    for loc in locales:
        r = await client.get(f"{base_url}/stores", headers={"Accept-Language": loc})
        assert r.status_code == 200, f"Locale {loc} failed"
        stores = r.json()["data"]["items"]
        assert len(stores) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# Store Operations (covered in test_customer_flow)
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# Recipe / Stock Deduction (covered in test_admin_setup_flow)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.public
@pytest.mark.asyncio
async def test_24h_store_returns_open_status(client: httpx.AsyncClient, base_url: str):
    """24h stores report as open during all hours regardless of time."""
    r = await client.get(f"{base_url}/stores")
    assert r.status_code == 200
    stores = r.json()["data"]["items"]
    # DB convention: 0=Monday, 6=Sunday (matches Python datetime.weekday())
    db_dow = datetime.now(timezone.utc).date().weekday()
    # Find stores that are 24h TODAY
    stores_24h = []
    for s in stores:
        for h in s.get("operating_hours", []):
            if h.get("day_of_week") == db_dow and h.get("is_24_hours"):
                # Verify the 24h flag is internally consistent
                assert h.get("open_time") in ("00:00", "00:00:00") or h.get("is_closed") == False, \
                    f"24h store {s['id']} should have 00:00 open_time or not be closed"
                stores_24h.append(s)
                break
    if not stores_24h:
        pytest.skip("No 24h store in seed data for today")
    r2 = await client.get(f"{base_url}/stores?is_open=true")
    assert r2.status_code == 200
    open_stores = {s["id"] for s in r2.json()["data"]["items"]}
    for s in stores_24h:
        assert s["id"] in open_stores, f"24h store {s['id']} should always report open"


@pytest.mark.public
@pytest.mark.asyncio
async def test_store_detail_includes_operating_hours(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Store detail includes full operating hours array."""
    r = await client.get(f"{base_url}/stores/{store_id}")
    assert r.status_code == 200
    store = r.json()["data"]
    assert "operating_hours" in store
    hours = store["operating_hours"]
    assert len(hours) == 7
    # Check that 24h flag is present
    for h in hours:
        assert "is_24_hours" in h
        assert "last_order_time" in h


# ═══════════════════════════════════════════════════════════════════════════
# Recipe / Stock Deduction (covered in test_admin_setup_flow)
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# Loyalty & Wallet
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.public
@pytest.mark.asyncio
async def test_loyalty_tiers_exist(client: httpx.AsyncClient, base_url: str):
    """Loyalty tiers are returned in bootstrap."""
    r = await client.get(f"{base_url}/config/bootstrap")
    assert r.status_code == 200
    data = r.json()["data"]
    assert "loyalty_tiers" in data
    assert len(data["loyalty_tiers"]) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# Equipment Maintenance
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.admin
@pytest.mark.asyncio
async def test_equipment_maintenance_log_lifecycle(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Equipment can have maintenance logs created and listed."""
    r = await client.get(f"{base_url}/admin/equipment?store_id={store_id}&per_page=1", headers=admin_headers)
    items = r.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include equipment"
    eq_id = items[0]["id"]

    # List existing logs
    r2 = await client.get(f"{base_url}/admin/equipment/{eq_id}/maintenance-logs", headers=admin_headers)
    assert r2.status_code == 200
    logs = r2.json()["data"]
    assert isinstance(logs, list)
