"""E2E tests validating API response shapes.

These tests act as contract tests — if the API response shape changes,
these will catch it immediately without needing backend imports.
"""

import pytest
import httpx
import uuid

pytestmark = [pytest.mark.smoke]


def assert_has_keys(d: dict, keys: set, path: str = "root"):
    missing = keys - d.keys()
    assert not missing, f"Missing keys at {path}: {missing}"


@pytest.mark.asyncio
async def test_get_order_response_shape(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """GET /admin/orders/{id} returns expected response shape."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No orders available for schema validation")
    order_id = items[0]["id"]

    r2 = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r2.status_code == 200
    raw = r2.json()

    # Validate envelope
    assert "data" in raw
    order = raw["data"]
    assert_has_keys(order, {
        "id", "order_number", "status", "payment_status",
        "total_amount", "items_subtotal", "store_id", "customer_id",
        "line_items", "created_at",
    })
    assert isinstance(order["line_items"], list)
    if order["line_items"]:
        li = order["line_items"][0]
        assert_has_keys(li, {"id", "menu_item_id", "quantity", "unit_price", "line_total"})


@pytest.mark.asyncio
async def test_customer_register_response_shape(
    client: httpx.AsyncClient, base_url: str, cleanup_registry: dict
):
    """POST /auth/register returns expected response shape."""
    ts = uuid.uuid4().hex[:16]
    payload = {
        "email_address": f"schema-test-{ts}@example.com",
        "display_name": f"Schema Test {ts}",
        "device_fingerprint": f"schema-device-{ts}",
    }
    r = await client.post(f"{base_url}/auth/register", json=payload)
    assert r.status_code == 201
    raw = r.json()
    cleanup_registry["customers"].append({"id": raw["user_id"]})

    # Core fields must be present
    assert_has_keys(raw, {"user_id", "tokens", "user_type"})
    assert raw["user_type"] == "customer"
    assert "access_token" in raw["tokens"]
    assert "refresh_token" in raw["tokens"]


@pytest.mark.asyncio
async def test_store_list_response_shape(
    client: httpx.AsyncClient, base_url: str
):
    """GET /stores returns paginated list with expected fields."""
    r = await client.get(f"{base_url}/stores")
    assert r.status_code == 200
    raw = r.json()
    assert "data" in raw
    data = raw["data"]
    assert_has_keys(data, {"items", "total", "page", "per_page", "total_pages"})
    stores = data["items"]
    assert isinstance(stores, list)
    if stores:
        store = stores[0]
        assert_has_keys(store, {
            "id", "store_name", "store_code", "slug",
            "is_active", "operating_hours",
        })


# ═══════════════════════════════════════════════════════════════════════════
# Order schema
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_order_list_response_shape(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """GET /admin/orders returns paginated order list with expected fields."""
    r = await client.get(f"{base_url}/admin/orders?store_id={store_id}&per_page=5", headers=admin_headers)
    assert r.status_code == 200
    raw = r.json()
    assert "data" in raw
    data = raw["data"]
    assert_has_keys(data, {"items", "total", "page", "per_page", "total_pages"})
    orders = data["items"]
    if orders:
        order = orders[0]
        assert_has_keys(order, {
            "id", "order_number", "status", "payment_status",
            "total_amount", "store_id", "created_at",
        })


# ═══════════════════════════════════════════════════════════════════════════
# Payment schema
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_admin_payments_list_shape(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str
):
    """GET /payments returns paginated payment list with expected fields."""
    r = await client.get(f"{base_url}/payments?per_page=5", headers=admin_headers)
    if r.status_code == 404:
        pytest.skip("Payment list endpoint not available (404)")
    if r.status_code == 200:
        raw = r.json()
        assert "data" in raw
        data = raw["data"]
        assert_has_keys(data, {"items", "total", "page", "per_page", "total_pages"})
        payments = data["items"]
        if payments:
            payment = payments[0]
            assert_has_keys(payment, {"id", "amount", "status", "payment_method_type"})


# ═══════════════════════════════════════════════════════════════════════════
# Inventory schema
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_inventory_item_response_shape(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int
):
    """GET /admin/inventory/items/{id} returns expected inventory shape."""
    r = await client.get(f"{base_url}/admin/inventory/items?store_id={store_id}&per_page=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No inventory items for schema validation")
    item_id = items[0]["id"]

    r2 = await client.get(f"{base_url}/admin/inventory/items/{item_id}?store_id={store_id}", headers=admin_headers)
    assert r2.status_code == 200
    item = r2.json()["data"]
    assert_has_keys(item, {
        "id", "item_code", "item_name", "unit_of_measure",
        "unit_cost", "item_type", "is_active", "is_direct_sale",
    })
    # Stock fields are in the nested stock object (populated when store_id is provided)
    stock = item.get("stock")
    if stock:
        assert_has_keys(stock, {
            "id", "inventory_item_id", "store_id",
            "current_stock", "reorder_level", "par_level",
        })


# ═══════════════════════════════════════════════════════════════════════════
# Menu item detail schema
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_menu_item_detail_response_shape(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str
):
    """GET /admin/menu/items/{id} returns expected menu item shape."""
    r = await client.get(f"{base_url}/admin/menu/items?per_page=1", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No menu items for schema validation")
    item_id = items[0]["id"]

    r2 = await client.get(f"{base_url}/admin/menu/items/{item_id}", headers=admin_headers)
    assert r2.status_code == 200
    item = r2.json()["data"]
    assert_has_keys(item, {
        "id", "item_name", "base_price",
        "is_available", "created_at",
    })
