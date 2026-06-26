"""Cover customer order placement across all order types and item categories."""

import os
import pytest
import httpx
import uuid

pytestmark = [pytest.mark.customer]


def _ensure_store_config(store_id: int, key: str, value: str):
    """Insert or update a StoreConfiguration row directly (no dedicated admin endpoint)."""
    try:
        import psycopg2
    except ImportError:
        return
    db_url = os.getenv("DATABASE_URL", "postgresql://fnb_user:fnb_pass@localhost:13334/fnb_enterprise_v3")
    sync_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(sync_url)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO store_configuration (store_id, config_key, config_value, description)
        VALUES (%s, %s, to_jsonb(%s::text), 'E2E test config')
        ON CONFLICT (store_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value
        """,
        (store_id, key, value),
    )
    conn.commit()
    cur.close()
    conn.close()


async def _register_customer(client: httpx.AsyncClient, base_url: str, cleanup_registry: dict) -> tuple[int, str]:
    ts = uuid.uuid4().hex[:16]
    r = await client.post(f"{base_url}/auth/register", json={
        "email_address": f"e2e-allorders-{ts}@example.com",
        "display_name": f"E2E AllOrders {ts}",
    })
    assert r.status_code == 201, f"Registration failed: {r.text}"
    data = r.json()
    cleanup_registry["customers"].append({"id": data["user_id"]})
    return data["user_id"], data["tokens"]["access_token"]


async def _add_to_cart(client, base_url, store_id, headers, menu_item_id, qty=1, bundle=None):
    payload = {
        "menu_item_id": menu_item_id,
        "quantity": qty,
        "selected_modifiers": [],
    }
    if bundle:
        payload["bundle_product_id"] = bundle["bundle_product_id"]
        payload["bundle_component_id"] = bundle["bundle_component_id"]
    r = await client.post(f"{base_url}/cart/items?store_id={store_id}", headers=headers, json=payload)
    assert r.status_code == 200, f"Add to cart failed: {r.text}"


async def _get_cart_id(client, base_url, store_id, headers):
    r = await client.get(f"{base_url}/cart?store_id={store_id}", headers=headers)
    assert r.status_code == 200
    return r.json()["data"]["id"]


@pytest.mark.asyncio
async def test_customer_orders_for_all_types(
    client: httpx.AsyncClient,
    base_url: str,
    store_id: int,
    admin_headers: dict,
    cleanup_registry: dict,
):
    """Place dine_in, takeaway and delivery orders using normal and bundle items."""

    # Ensure delivery fee config exists so delivery orders can compute a total
    _ensure_store_config(store_id, "order.delivery_fee", "5.00")

    # Fetch a normal menu item and an active bundle product
    r_menu = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r_menu.status_code == 200
    menu_data = r_menu.json()["data"]
    items = menu_data["items"]
    assert len(items) >= 1, "Need at least one menu item"
    normal_item = items[0]

    bundle_id = None
    bundle_components = []
    bundles = menu_data.get("bundle_products", [])
    if bundles:
        bundle = bundles[0]
        bundle_id = bundle["id"]
        # For fixed bundles, add every component in default_quantity
        for comp in bundle.get("components", []):
            bundle_components.append({
                "bundle_product_id": bundle_id,
                "bundle_component_id": comp["id"],
                "menu_item_id": comp["menu_item_id"],
                "qty": comp.get("default_quantity", 1),
            })

    # Dine-in order with normal item
    customer_id, token = await _register_customer(client, base_url, cleanup_registry)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    await _add_to_cart(client, base_url, store_id, headers, normal_item["id"], qty=1)
    cart_id = await _get_cart_id(client, base_url, store_id, headers)
    r_order = await client.post(f"{base_url}/orders", headers=headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "dine_in",
        "fulfillment_type": "dine_in_service",
    })
    assert r_order.status_code == 201, f"Dine-in order failed: {r_order.text}"
    order = r_order.json()["data"]
    cleanup_registry["orders"].append({"id": order["id"]})
    assert order["order_type"] == "dine_in"
    assert order["fulfillment_type"] == "dine_in_service"

    # Takeaway order with normal item
    customer_id, token = await _register_customer(client, base_url, cleanup_registry)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    await _add_to_cart(client, base_url, store_id, headers, normal_item["id"], qty=2)
    cart_id = await _get_cart_id(client, base_url, store_id, headers)
    r_order = await client.post(f"{base_url}/orders", headers=headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "takeaway",
        "fulfillment_type": "counter_pickup",
    })
    assert r_order.status_code == 201, f"Takeaway order failed: {r_order.text}"
    order = r_order.json()["data"]
    cleanup_registry["orders"].append({"id": order["id"]})
    assert order["order_type"] == "takeaway"

    # Delivery order with normal item
    customer_id, token = await _register_customer(client, base_url, cleanup_registry)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    await _add_to_cart(client, base_url, store_id, headers, normal_item["id"], qty=1)
    cart_id = await _get_cart_id(client, base_url, store_id, headers)
    r_order = await client.post(f"{base_url}/orders", headers=headers, json={
        "store_id": store_id,
        "cart_id": cart_id,
        "order_type": "delivery",
        "fulfillment_type": "standard_delivery",
    })
    assert r_order.status_code == 201, f"Delivery order failed: {r_order.text}"
    order = r_order.json()["data"]
    cleanup_registry["orders"].append({"id": order["id"]})
    assert order["order_type"] == "delivery"
    assert order["delivery_fee"] > 0

    # Bundle order (takeaway) if a bundle is available
    if bundle_id and bundle_components:
        customer_id, token = await _register_customer(client, base_url, cleanup_registry)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        for comp in bundle_components:
            await _add_to_cart(client, base_url, store_id, headers, comp["menu_item_id"], qty=comp["qty"], bundle=comp)
        cart_id = await _get_cart_id(client, base_url, store_id, headers)
        r_order = await client.post(f"{base_url}/orders", headers=headers, json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": "takeaway",
            "fulfillment_type": "counter_pickup",
        })
        assert r_order.status_code == 201, f"Bundle order failed: {r_order.text}"
        order = r_order.json()["data"]
        cleanup_registry["orders"].append({"id": order["id"]})
        assert order["order_type"] == "takeaway"
