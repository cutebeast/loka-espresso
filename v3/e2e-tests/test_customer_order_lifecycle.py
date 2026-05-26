"""
E2E Test Suite: Order Lifecycle Validation

Covers:
  - Cannot cancel a preparing order (customer cancel rejected)
  - Cannot cancel a delivered order (customer cancel rejected)
  - Duplicate order prevention (same cart submitted twice returns 409 or 400)
"""

import pytest
import httpx
import uuid

pytestmark = [pytest.mark.customer]


# ═══════════════════════════════════════════════════════════════════════════
# Cancellation rejection — preparing order
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cannot_cancel_preparing_order(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Customer cannot cancel an order that is already being prepared.

    Steps:
    1. Register customer and create an order
    2. Admin updates order status to "preparing"
    3. Customer attempts to cancel → 400 rejection
    """
    ts = uuid.uuid4().hex[:16]
    email = f"cancel-prep-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"CancelPrep {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    # Add to cart
    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })
    assert r_add.status_code == 200, f"Add to cart failed: {r_add.text}"

    # Get cart
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    # Create order
    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order_id = r_order.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Admin sets order to "preparing"
    r_status = await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "preparing"},
    )
    assert r_status.status_code == 200, f"Status update to preparing failed: {r_status.text}"

    # Verify status
    r_check = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_check.status_code == 200
    assert r_check.json()["data"]["status"] == "preparing"

    # Customer attempts to cancel → should be rejected (order in preparing state)
    r_cancel = await client.post(f"{base_url}/orders/{order_id}/cancel", headers=cust_headers)
    assert r_cancel.status_code == 409, \
        f"Expected 409 Conflict for cancel during preparing, got {r_cancel.status_code}: {r_cancel.text}"


# ═══════════════════════════════════════════════════════════════════════════
# Cancellation rejection — delivered order
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cannot_cancel_delivered_order(
    client: httpx.AsyncClient, admin_headers: dict, base_url: str, store_id: int, cleanup_registry: dict
):
    """Customer cannot cancel an order that has already been delivered.

    Steps:
    1. Register customer and create an order
    2. Admin updates status to delivered
    3. Customer attempts to cancel → 400 rejection
    """
    ts = uuid.uuid4().hex[:16]
    email = f"cancel-deliv-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"CancelDeliv {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    # Add to cart
    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 1,
        "selected_modifiers": [],
    })
    assert r_add.status_code == 200, f"Add to cart failed: {r_add.text}"

    # Get cart
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    # Create order
    r_order = await client.post(f"{base_url}/orders", headers=cust_headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
    order_id = r_order.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Admin sets order to "delivered"
    r_status = await client.patch(
        f"{base_url}/admin/orders/{order_id}/status",
        headers=admin_headers,
        json={"status": "delivered"},
    )
    assert r_status.status_code == 200, f"Status update to delivered failed: {r_status.text}"

    # Verify status
    r_check = await client.get(f"{base_url}/admin/orders/{order_id}", headers=admin_headers)
    assert r_check.status_code == 200
    assert r_check.json()["data"]["status"] == "delivered"

    # Customer attempts to cancel → should be rejected (already delivered)
    r_cancel = await client.post(f"{base_url}/orders/{order_id}/cancel", headers=cust_headers)
    assert r_cancel.status_code == 409, \
        f"Expected 409 Conflict for cancel after delivery, got {r_cancel.status_code}: {r_cancel.text}"


# ═══════════════════════════════════════════════════════════════════════════
# Duplicate order prevention
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_duplicate_order_prevention(
    client: httpx.AsyncClient, base_url: str, store_id: int, cleanup_registry: dict
):
    """Submitting the same cart twice should reject the second attempt.

    Since order creation empties the cart, a second attempt with the
    same (now-empty) cart_id should fail with a 400 or 409.
    """
    ts = uuid.uuid4().hex[:16]
    email = f"dup-order-{ts}@example.com"

    # Register customer
    reg = await client.post(f"{base_url}/auth/register", json={
        "email_address": email,
        "display_name": f"DupOrder {ts}",
    })
    assert reg.status_code == 201, f"Registration failed: {reg.text}"
    customer_id = reg.json()["user_id"]
    cleanup_registry["customers"].append({"id": customer_id})
    token = reg.json()["tokens"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get a menu item
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    items = r_menu.json()["data"]["items"]
    assert len(items) > 0, "Seed data must include menu items"
    item = items[0]

    # Add to cart
    r_add = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=cust_headers, json={
        "menu_item_id": item["id"],
        "quantity": 2,
        "selected_modifiers": [],
    })
    assert r_add.status_code == 200, f"Add to cart failed: {r_add.text}"

    # Get cart
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json()["data"]["id"]

    order_payload = {
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    }

    # First order — should succeed
    r1 = await client.post(f"{base_url}/orders", headers=cust_headers, json=order_payload)
    assert r1.status_code == 201, f"First order creation failed: {r1.text}"
    order_id = r1.json()["data"]["id"]
    cleanup_registry["orders"].append({"id": order_id})

    # Second order with same cart_id — cart is now empty, should fail
    r2 = await client.post(f"{base_url}/orders", headers=cust_headers, json=order_payload)
    assert r2.status_code in (400, 409, 422), \
        f"Expected duplicate order to be rejected (400/409/422), got {r2.status_code}: {r2.text}"
