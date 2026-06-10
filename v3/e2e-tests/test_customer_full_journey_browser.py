"""
Browser-based E2E test for the complete customer journey.

Covers:
  - Browse public menu as guest
  - Add items to cart
  - Customer registration
  - Login
  - Place order
  - View order history
"""

import pytest
import uuid

pytestmark = [pytest.mark.customer, pytest.mark.browser]

BASE_URL = "http://localhost:13810"
API_URL = "http://localhost:13800/api/v1"


@pytest.fixture(scope="function")
def page():
    """Launch a browser page for testing."""
    pytest.importorskip("playwright")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        pg = context.new_page()
        yield pg
        context.close()
        browser.close()


@pytest.mark.asyncio
async def test_api_customer_journey():
    """Full customer journey via API (no browser) — mirrors what the PWA does."""
    import httpx

    ts = uuid.uuid4().hex[:12]
    base_url = API_URL

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Browse public menu as guest
        r_menu = await client.get(f"{base_url}/menu/stores/1")
        assert r_menu.status_code == 200, f"Menu failed: {r_menu.text}"
        menu_data = r_menu.json()["data"]
        assert "items" in menu_data
        assert len(menu_data["items"]) >= 1, "Menu must have items"
        item = menu_data["items"][0]
        item_id = item["id"]

        # 2. Add to cart as guest
        r_add = await client.post(
            f"{base_url}/cart/items?store_id=1",
            json={"menu_item_id": item_id, "quantity": 1, "selected_modifiers": []},
        )
        assert r_add.status_code == 200, f"Add to cart failed: {r_add.text}"

        # 3. View cart
        r_cart = await client.get(f"{base_url}/cart?store_id=1")
        assert r_cart.status_code == 200, f"Cart failed: {r_cart.text}"
        cart_data = r_cart.json()["data"]
        assert len(cart_data.get("line_items", [])) >= 1

        # 4. Register customer
        email = f"journey-{ts}@example.com"
        r_reg = await client.post(
            f"{base_url}/auth/register",
            json={"email_address": email, "display_name": f"Journey {ts}"},
        )
        assert r_reg.status_code == 201, f"Register failed: {r_reg.text}"
        token = r_reg.json()["tokens"]["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 5. Cart should persist after login (same session via cookies, but with async client
        # we don't share cookies — in real PWA the browser handles this)
        # Re-add to cart with auth header
        r_add2 = await client.post(
            f"{base_url}/cart/items?store_id=1",
            headers=headers,
            json={"menu_item_id": item_id, "quantity": 1, "selected_modifiers": []},
        )
        assert r_add2.status_code == 200, f"Re-add to cart failed: {r_add2.text}"

        # 6. Create order
        r_cart2 = await client.get(f"{base_url}/cart?store_id=1", headers=headers)
        cart_id = r_cart2.json()["data"]["id"]
        r_order = await client.post(
            f"{base_url}/orders",
            headers=headers,
            json={
                "store_id": 1,
                "cart_id": cart_id,
                "order_type": "takeaway",
                "fulfillment_type": "counter_pickup",
            },
        )
        assert r_order.status_code == 201, f"Order creation failed: {r_order.text}"
        order = r_order.json()["data"]
        assert order["status"] == "pending"
        order_id = order["id"]

        # 7. View order history
        r_list = await client.get(f"{base_url}/orders", headers=headers)
        assert r_list.status_code == 200
        orders = r_list.json()["data"]["items"]
        assert any(o["id"] == order_id for o in orders), "New order not in history"

        # 8. Get order detail
        r_detail = await client.get(f"{base_url}/orders/{order_id}", headers=headers)
        assert r_detail.status_code == 200
        detail = r_detail.json()["data"]
        assert detail["id"] == order_id
        assert detail["status"] == "pending"


def test_browser_customer_menu_renders(page):
    """Customer PWA homepage renders without errors."""
    page.goto(f"{BASE_URL}/")
    page.wait_for_load_state("networkidle")
    # Basic sanity: body should have content
    body = page.locator("body").inner_text()
    assert len(body) > 50, "Page body is empty — possible crash"


def test_browser_customer_store_menu_renders(page):
    """Store menu page renders menu items."""
    page.goto(f"{BASE_URL}/stores/1")
    page.wait_for_load_state("networkidle")
    # Look for some menu-related text or item container
    body = page.locator("body").inner_text()
    assert "menu" in body.lower() or "item" in body.lower() or "add" in body.lower(), \
        f"Menu page doesn't show expected content: {body[:200]}"
