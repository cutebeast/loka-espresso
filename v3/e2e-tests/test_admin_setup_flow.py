"""
E2E Test Suite: Admin Setup Flows

Covers:
  - Store CRUD + operating hours (24h support)
  - Menu: categories, items, modifiers, allergens, dietary tags, recipes
  - Inventory: categories, items, suppliers, purchase orders
  - Equipment: assets, maintenance logs
  - Marketing: campaigns, promo banners, vouchers, rewards, surveys
  - Staff: profiles, shifts, tips
  - Content: info cards, product cards, event cards, system pages, splash screens
  - Notifications: templates, admin notifications
"""

import pytest
import httpx
from datetime import datetime, timezone, timedelta, date

pytestmark = [pytest.mark.admin]


def assert_has_keys(d: dict, keys: set, path: str = "root"):
    missing = keys - d.keys()
    assert not missing, f"Missing keys at {path}: {missing}"


# ═══════════════════════════════════════════════════════════════════════════
# Store Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_stores(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Admin can list stores and operating_hours are included."""
    r = await client.get(f"{base_url}/admin/stores?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert len(data["items"]) >= 2
    store = data["items"][0]
    assert "operating_hours" in store
    assert isinstance(store["operating_hours"], list)


@pytest.mark.asyncio
async def test_store_has_24h_flag(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """At least one store has 24h operating hours set."""
    r = await client.get(f"{base_url}/admin/stores?per_page=50", headers=admin_headers)
    data = r.json()["data"]["items"]
    stores_with_24h = [
        s for s in data
        if any(h.get("is_24_hours") for h in s.get("operating_hours", []))
    ]
    assert len(stores_with_24h) >= 1, "No store has 24h hours set"


@pytest.mark.asyncio
async def test_update_store_operating_hours(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """Admin can update store operating hours including 24h flag."""
    # Capture original hours for teardown
    r_orig = await client.get(f"{base_url}/admin/stores/{store_id}", headers=admin_headers)
    original_hours = r_orig.json()["data"]["operating_hours"]

    hours = [
        {"day_of_week": i, "open_time": "08:00", "close_time": "22:00", "is_closed": False, "is_24_hours": False, "last_order_time": None}
        for i in range(7)
    ]
    # Set Sunday to 24h
    hours[6]["is_24_hours"] = True
    hours[6]["open_time"] = "00:00"
    hours[6]["close_time"] = "23:59"
    hours[6]["last_order_time"] = "23:30"

    try:
        # Use the dedicated operating-hours replacement endpoint
        r = await client.put(f"{base_url}/admin/stores/{store_id}/operating-hours", headers=admin_headers, json=hours)
        assert r.status_code == 200, f"Update failed: {r.text}"

        # Verify
        r2 = await client.get(f"{base_url}/admin/stores/{store_id}", headers=admin_headers)
        stored = r2.json()["data"]["operating_hours"]
        sunday = next(h for h in stored if h["day_of_week"] == 6)
        assert sunday["is_24_hours"] is True
    finally:
        # Restore original hours
        await client.put(
            f"{base_url}/admin/stores/{store_id}/operating-hours",
            headers=admin_headers,
            json=original_hours,
        )


# ═══════════════════════════════════════════════════════════════════════════
# Menu Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_menu_categories(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Menu categories exist and are listable."""
    r = await client.get(f"{base_url}/admin/menu/categories?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_list_menu_items_with_recipes(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    """Menu items exist and include recipes array."""
    r = await client.get(f"{base_url}/admin/menu/items?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    # At least some items should have recipes
    items_with_recipes = [i for i in items if i.get("recipes")]
    assert len(items_with_recipes) >= 1, "No menu items have recipes"


@pytest.mark.asyncio
async def test_list_allergens(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/menu/allergens?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_list_dietary_tags(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/dietary-tags?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# Inventory Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_inventory_items(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/inventory/items?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_suppliers(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/inventory/suppliers?store_id={store_id}", headers=admin_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) >= 1


@pytest.mark.asyncio
async def test_list_purchase_orders(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/inventory/purchase-orders?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


# ═══════════════════════════════════════════════════════════════════════════
# Equipment Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_equipment(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/equipment?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_equipment_has_maintenance_logs(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/equipment?store_id={store_id}&per_page=50", headers=admin_headers)
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    first = items[0]
    assert "maintenance_logs" in first
    # Fetch detail to verify inline logs work
    r2 = await client.get(f"{base_url}/admin/equipment/{first['id']}", headers=admin_headers)
    assert r2.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Marketing Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_marketing_campaigns(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/marketing/campaigns?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_promo_banners(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/promo-banners?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_vouchers(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/vouchers?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_rewards(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/rewards?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_surveys(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/surveys?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


# ═══════════════════════════════════════════════════════════════════════════
# Staff Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_staff_profiles(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/staff?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_list_staff_shifts(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    """List shifts for a specific staff member."""
    # First get a staff member
    r = await client.get(f"{base_url}/admin/staff?store_id={store_id}&per_page=1", headers=admin_headers)
    assert r.status_code == 200
    staff_items = r.json()["data"]["items"]
    assert len(staff_items) > 0, "Seed data must include staff"
    staff_id = staff_items[0]["id"]

    r2 = await client.get(f"{base_url}/admin/staff/{staff_id}/shifts?per_page=50", headers=admin_headers)
    assert r2.status_code == 200
    data = r2.json()["data"]
    assert "items" in data
    shifts = data["items"]
    assert isinstance(shifts, list)
    if shifts:
        shift = shifts[0]
        assert_has_keys(shift, {"id", "staff_id", "store_id", "date", "start_time", "end_time"})


@pytest.mark.asyncio
async def test_list_tip_allocations(client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int):
    r = await client.get(f"{base_url}/admin/staff/tips?store_id={store_id}&per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


# ═══════════════════════════════════════════════════════════════════════════
# Content Setup
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_info_cards(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/info-cards?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


@pytest.mark.asyncio
async def test_list_product_cards(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/product-cards?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


@pytest.mark.asyncio
async def test_list_event_cards(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/event-cards?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


@pytest.mark.asyncio
async def test_list_system_pages(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/system-pages?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


@pytest.mark.asyncio
async def test_list_splash_screens(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/content/splash-screens?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data


# ═══════════════════════════════════════════════════════════════════════════
# Notifications
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_notification_templates(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/notifications/templates/list?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_list_admin_notifications(client: httpx.AsyncClient, admin_headers: dict, base_url: str):
    r = await client.get(f"{base_url}/admin/notifications?per_page=50", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert len(data["items"]) >= 1
