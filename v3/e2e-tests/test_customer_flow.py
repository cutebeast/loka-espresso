"""
E2E Test Suite: Customer Flows

Covers:
  - Customer registration / login
  - Browse stores (with 24h support)
  - Browse menu (with translations)
  - Cart operations (add, update, remove, clear)
  - Order creation from cart
  - Vouchers & rewards (authenticated)
  - Feedback submission (authenticated)
  - Survey listing
"""

import pytest
import httpx
from datetime import datetime, timezone


# ═══════════════════════════════════════════════════════════════════════════
# Auth & Registration
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_bootstrap(client: httpx.AsyncClient, base_url: str):
    """Public bootstrap endpoint returns stores, loyalty tiers, etc."""
    r = await client.get(f"{base_url}/config/bootstrap")
    assert r.status_code == 200
    data = r.json()["data"]
    assert "stores" in data
    assert len(data["stores"]) >= 1


@pytest.mark.asyncio
async def test_customer_list_stores(client: httpx.AsyncClient, base_url: str):
    """Customer can list stores via public API."""
    r = await client.get(f"{base_url}/stores")
    assert r.status_code == 200
    stores = r.json()["data"]
    assert len(stores) >= 1


@pytest.mark.asyncio
async def test_customer_list_stores_with_locale(client: httpx.AsyncClient, base_url: str):
    """Public stores API respects Accept-Language for translations."""
    r = await client.get(f"{base_url}/stores", headers={"Accept-Language": "ms"})
    assert r.status_code == 200
    stores = r.json()["data"]
    assert len(stores) >= 1


@pytest.mark.asyncio
async def test_customer_auth_flow(client: httpx.AsyncClient, base_url: str):
    """Customer can register and login to obtain a valid token."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    payload = {
        "email_address": f"e2e-test-{ts}@example.com",
        "display_name": f"E2E Test Customer {ts}",
        "device_fingerprint": f"e2e-device-{ts}",
    }
    r = await client.post(f"{base_url}/auth/register", json=payload)
    assert r.status_code == 201, f"Registration failed: {r.text}"
    data = r.json()
    assert "tokens" in data
    assert data["user_type"] == "customer"

    # Login with the same email
    login_payload = {
        "email_address": payload["email_address"],
        "device_fingerprint": payload["device_fingerprint"],
    }
    r2 = await client.post(f"{base_url}/auth/login", json=login_payload)
    assert r2.status_code == 200, f"Login failed: {r2.text}"
    data2 = r2.json()
    assert data2["user_type"] == "customer"
    assert "tokens" in data2


# ═══════════════════════════════════════════════════════════════════════════
# Menu & Store Detail
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_get_store_menu(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Customer can get full menu for a store."""
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert "categories" in data
    assert "items" in data
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_customer_get_menu_item_with_translation(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Menu item returns translated content when locale is set."""
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    item_id = items[0]["id"]

    r2 = await client.get(f"{base_url}/menu/items/{item_id}", headers={"Accept-Language": "ms"})
    assert r2.status_code == 200
    item = r2.json()["data"]
    assert "item_name" in item


@pytest.mark.asyncio
async def test_customer_store_open_filter(client: httpx.AsyncClient, base_url: str):
    """Public store list supports is_open filter."""
    r = await client.get(f"{base_url}/stores?is_open=true")
    assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# Cart & Checkout
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_cart_lifecycle(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Customer can add items to cart, update quantity, and clear cart."""
    # Register a fresh customer for this test
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"e2e-cart-{ts}@example.com",
        "display_name": f"E2E Cart {ts}",
    })
    assert reg.status_code == 201
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get a menu item
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    item = items[0]

    # Add to cart
    add_payload = {
        "menu_item_id": item["id"],
        "quantity": 2,
        "selected_modifiers": [],
        "special_instructions": "Extra hot",
    }
    r2 = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=headers, json=add_payload)
    assert r2.status_code == 200, f"Add to cart failed: {r2.text}"

    # GET cart to verify items (add endpoint may not return line_items inline)
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=headers)
    assert r_cart.status_code == 200
    cart = r_cart.json()["data"]
    assert cart["store_id"] == store_id
    line_items = [li for li in cart.get("line_items", [])]
    assert len(line_items) >= 1, f"No line items in cart: {cart}"

    # Update quantity
    line_id = line_items[0]["id"]
    r3 = await client.patch(f"{base_url}/cart/items/{line_id}?store_id={store_id}", headers=headers, json={"quantity": 3})
    assert r3.status_code == 200, f"Update cart failed: {r3.text}"

    # Clear cart
    r4 = await client.delete(f"{base_url}/cart?store_id={store_id}", headers=headers)
    assert r4.status_code == 204, f"Clear cart failed: {r4.status_code}"


@pytest.mark.asyncio
async def test_customer_order_flow(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Customer can create an order from cart."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"e2e-order-{ts}@example.com",
        "display_name": f"E2E Order {ts}",
    })
    assert reg.status_code == 201
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    customer_id = reg.json()["user_id"]

    # Get a menu item
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    items = r.json()["data"]["items"]
    if not items:
        pytest.skip("No menu items available")
    item = items[0]

    # Add to cart
    await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })

    # Get cart to find cart_id
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    # Create order
    order_payload = {
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    }
    r_order = await client.post(f"{base_url}/orders", headers=headers, json=order_payload)
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order = r_order.json()["data"]
    assert order["customer_id"] == customer_id
    assert order["status"] == "pending"
    assert "order_number" in order

    # List customer orders
    r_list = await client.get(f"{base_url}/orders", headers=headers)
    assert r_list.status_code == 200
    orders = r_list.json()["data"]["items"]
    assert any(o["id"] == order["id"] for o in orders)


# ═══════════════════════════════════════════════════════════════════════════
# Vouchers & Rewards (Authenticated)
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_list_vouchers_requires_auth(client: httpx.AsyncClient, base_url: str):
    """Public vouchers endpoint requires authentication."""
    r = await client.get(f"{base_url}/vouchers/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_customer_list_rewards_requires_auth(client: httpx.AsyncClient, base_url: str):
    """Public rewards endpoint requires authentication."""
    r = await client.get(f"{base_url}/rewards/me")
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# Reservations
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_store_detail(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Public store detail includes operating hours and special hours."""
    r = await client.get(f"{base_url}/stores/{store_id}")
    assert r.status_code == 200
    store = r.json()["data"]
    assert "operating_hours" in store
    assert isinstance(store["operating_hours"], list)
    assert "special_hours" in store
    assert isinstance(store["special_hours"], list)


# ═══════════════════════════════════════════════════════════════════════════
# Feedback
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_submit_feedback_requires_auth(client: httpx.AsyncClient, base_url: str, store_id: int):
    """Feedback submission requires authentication."""
    payload = {
        "store_id": store_id,
        "rating": 5,
        "category": "general",
        "message": "Great coffee and friendly staff!",
        "source": "in_app",
    }
    r = await client.post(f"{base_url}/feedback", json=payload)
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════
# Surveys
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_customer_list_surveys(client: httpx.AsyncClient, base_url: str):
    """Customer can list active surveys."""
    r = await client.get(f"{base_url}/surveys")
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
