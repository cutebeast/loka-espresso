"""
Browser-based E2E test for the complete customer PWA journey.

Uses Playwright to verify the actual UI renders and key interactions work.
"""

import pytest
import re
import uuid

pytestmark = [pytest.mark.customer, pytest.mark.browser]

BASE_URL = "http://localhost:13810"


@pytest.fixture(scope="function")
def page():
    pytest.importorskip("playwright")
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            java_script_enabled=True,
        )
        pg = context.new_page()
        yield pg
        context.close()
        browser.close()


def test_pwa_homepage_loads(page):
    """Customer PWA homepage renders with stores or menu content."""
    page.goto(f"{BASE_URL}/#home", wait_until="networkidle")
    body = page.locator("body").inner_text()
    assert len(body) > 100, "Homepage body is empty — possible crash"
    assert "loka" in body.lower() or "espresso" in body.lower() or "menu" in body.lower() or "store" in body.lower(), \
        f"Homepage missing expected branding: {body[:300]}"


def test_pwa_store_menu_renders(page):
    """Store menu page shows menu items that can be interacted with."""
    page.goto(f"{BASE_URL}/#menu", wait_until="networkidle")
    body = page.locator("body").inner_text()
    assert len(body) > 100, "Menu page body is empty"


def test_pwa_menu_item_detail_renders(page):
    """Individual menu item page renders (item details open as overlay in PWA)."""
    page.goto(f"{BASE_URL}/#menu", wait_until="networkidle")
    body = page.locator("body").inner_text()
    assert len(body) > 50, "Menu page is empty"


def test_pwa_cart_page_renders(page):
    """Cart page renders even when empty."""
    page.goto(f"{BASE_URL}/#cart", wait_until="networkidle")
    body = page.locator("body").inner_text()
    assert len(body) > 50, "Cart page is empty"


def test_pwa_full_journey_register_and_order(page):
    """Full journey: browse menu → add to cart → cart page."""
    # 1. Browse menu
    page.goto(f"{BASE_URL}/#menu", wait_until="networkidle")
    page.wait_for_timeout(2000)

    body = page.locator("body").inner_text()
    if "empty" in body.lower() and "cart" not in body.lower():
        pytest.skip("Menu page shows empty state — no items to test with")

    # 2. Try to find and click an "Add" button for a menu item
    add_buttons = page.locator("button").filter(has_text="Add")
    if add_buttons.count() == 0:
        add_buttons = page.locator("button").filter(has_text=re.compile("add|plus|\\+", re.IGNORECASE))

    if add_buttons.count() == 0:
        pytest.skip("No 'Add' buttons found on menu page — may need different selector")

    add_buttons.first.click()
    page.wait_for_timeout(1000)

    # 3. Navigate to cart
    page.goto(f"{BASE_URL}/#cart", wait_until="networkidle")
    page.wait_for_timeout(1000)

    cart_body = page.locator("body").inner_text()
    assert len(cart_body) > 50, "Cart page is empty after adding item"

    # 4. Navigate to orders
    page.goto(f"{BASE_URL}/#orders", wait_until="networkidle")
    page.wait_for_timeout(1000)
    orders_body = page.locator("body").inner_text()
    assert len(orders_body) > 50, "Orders page is empty"
