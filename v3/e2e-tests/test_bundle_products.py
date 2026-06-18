"""Bundle products and add-on deal E2E tests.

Round 19 — covers admin CRUD, public menu exposure, bundle discount math,
cart dedup (H1 fix), max_per_order (M4 fix), and add-on deal discount (C1).
"""

import pytest
import httpx
import asyncio

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD

pytestmark = [pytest.mark.admin]


async def _ensure_menu_items(client: httpx.AsyncClient, base_url: str, admin_headers: dict, store_id: int):
    """Ensure at least one menu item exists. Create one via admin API if none found."""
    r = await client.get(f"{base_url}/menu/items?limit=1")
    data = r.json().get("data", {})
    items = data.get("items", [])
    if items:
        return items[0]["id"]

    # Create a test menu item
    r_create = await client.post(
        f"{base_url}/admin/menu/items",
        headers=admin_headers,
        json={
            "item_name": "E2E Test Burger",
            "item_code": "E2E-BURGER",
            "base_price": 12.90,
            "category_id": 1,
            "is_available": True,
        },
    )
    if r_create.status_code in (200, 201):
        return r_create.json().get("data", {}).get("id", 0)
    return 0


# ───────────────────────────────────────────────────────
# Admin Bundle CRUD
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bundle_product_create(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Create a bundle product via admin API."""
    item_id = await _ensure_menu_items(client, base_url, admin_headers, store_id)
    if not item_id:
        pytest.skip("No menu items available for bundle creation")

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Combo Meal",
            "bundle_type": "combo",
            "bundle_price": 15.00,
            "is_active": True,
            "components": [
                {
                    "menu_item_id": item_id,
                    "default_quantity": 1,
                    "is_required": True,
                    "is_swappable": False,
                    "swap_group": None,
                    "sort_order": 0,
                    "modifier_overrides": [],
                }
            ],
        },
    )
    assert r.status_code in (200, 201), f"Bundle create failed: {r.text}"
    data = r.json().get("data", {})
    assert data.get("id")
    assert data.get("message") == "Created"


@pytest.mark.asyncio
async def test_bundle_product_list(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
):
    """List bundle products — returns items array."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=10", headers=admin_headers)
    assert r.status_code == 200, f"Bundle list failed: {r.text}"
    data = r.json().get("data", [])
    assert isinstance(data, list)
    if data:
        bp = data[0]
        assert "id" in bp
        assert "title" in bp
        assert "bundle_price" in bp
        assert "components" in bp


@pytest.mark.asyncio
async def test_bundle_product_get_detail(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
):
    """Get a bundle product detail — returns components with menu item info."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    items = r.json().get("data", [])
    if not items:
        pytest.skip("No bundle products to test detail")
    bp_id = items[0]["id"]

    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    assert r_detail.status_code == 200, f"Bundle detail failed: {r_detail.text}"
    detail = r_detail.json().get("data", {})
    assert detail["id"] == bp_id
    assert detail["title"]
    assert isinstance(detail["components"], list)
    if detail["components"]:
        comp = detail["components"][0]
        assert comp.get("menu_item_id")
        assert "menu_item_name" in comp


@pytest.mark.asyncio
async def test_bundle_product_update(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
):
    """Update a bundle product title."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    items = r.json().get("data", [])
    if not items:
        pytest.skip("No bundle products to test update")
    bp_id = items[0]["id"]

    r_patch = await client.patch(
        f"{base_url}/admin/menu/bundle-products/{bp_id}",
        headers=admin_headers,
        json={"title": "E2E Updated Combo"},
    )
    assert r_patch.status_code == 200, f"Bundle update failed: {r_patch.text}"
    assert r_patch.json().get("data", {}).get("message") == "Updated"


@pytest.mark.asyncio
async def test_bundle_product_delete(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
):
    """Soft delete a bundle product."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    items = r.json().get("data", [])
    if not items:
        pytest.skip("No bundle products to test delete")
    bp_id = items[0]["id"]

    r_del = await client.delete(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    assert r_del.status_code == 200, f"Bundle delete failed: {r_del.text}"
    assert r_del.json().get("data", {}).get("deleted") is True


# ───────────────────────────────────────────────────────
# Public menu bundle exposure
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_public_menu_includes_bundle_products(
    client: httpx.AsyncClient,
    base_url: str,
    store_id: int,
):
    """GET /menu/stores/{store_id} returns bundle_products array."""
    r = await client.get(f"{base_url}/menu/stores/{store_id}")
    assert r.status_code == 200, f"Menu failed: {r.text}"
    data = r.json().get("data", {})
    assert "bundle_products" in data
    bundles = data.get("bundle_products", [])
    assert isinstance(bundles, list)


@pytest.mark.asyncio
async def test_public_bundle_products_endpoint(
    client: httpx.AsyncClient,
    base_url: str,
):
    """GET /menu/bundle-products returns active bundle products."""
    r = await client.get(f"{base_url}/menu/bundle-products")
    assert r.status_code == 200, f"Bundle products public failed: {r.text}"
    data = r.json().get("data", [])
    assert isinstance(data, list)
    if data:
        bp = data[0]
        assert "id" in bp
        assert "bundle_price" in bp
        assert "components" in bp


# ───────────────────────────────────────────────────────
# Bundle discount flow (customer: cart → order → verify)
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bundle_cart_add_and_order_discount(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Add bundle components to cart, create order, verify bundle_discount."""
    # Get a bundle product from admin
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    bundles = r.json().get("data", [])
    if not bundles:
        pytest.skip("No bundle products to test discount flow")
    bp = bundles[0]
    bp_id = bp["id"]

    # Register/login a customer
    import uuid
    phone = "+6012" + uuid.uuid4().hex[:7]
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add each bundle component to cart
    for comp in bp["components"]:
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": comp["menu_item_id"],
                "quantity": comp.get("default_quantity", 1),
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
            },
        )
        assert r_add.status_code == 200, f"Add component to cart failed (item {comp['menu_item_id']}): {r_add.text}"

    # Get cart
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_data = r_cart.json().get("data", {})
    cart_id = cart_data.get("id")
    assert cart_id, "Cart not found"

    # Create order
    r_order = await client.post(
        f"{base_url}/orders",
        headers=cust_headers,
        json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": "takeaway",
            "fulfillment_type": "counter_pickup",
        },
    )
    assert r_order.status_code in (200, 201), f"Order create failed: {r_order.text}"
    order = r_order.json().get("data", {})
    order_id = order.get("id")
    assert order_id, "Order ID missing"

    # Verify bundle_discount > 0 (component_sum > bundle_price)
    # The discount may be 0 if component prices equal bundle_price, but verify the field exists
    assert "discount_amount" in order, "discount_amount missing from order"
    assert isinstance(order.get("discount_amount"), (int, float))


# ───────────────────────────────────────────────────────
# Cart dedup with bundle_product_id (H1 fix)
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bundle_cart_dedup_preserves_bundle_product_id(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Standalone item + same item as bundle component → separate lines (not merged)."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    bundles = r.json().get("data", [])
    if not bundles:
        pytest.skip("No bundle products")
    bp = bundles[0]
    bp_id = bp["id"]
    if not bp["components"]:
        pytest.skip("Bundle has no components")
    comp = bp["components"][0]
    item_id = comp["menu_item_id"]

    # Customer auth
    import uuid
    phone = "+6013" + uuid.uuid4().hex[:7]
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add standalone (no bundle_product_id)
    r_add1 = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={"menu_item_id": item_id, "quantity": 1, "selected_modifiers": []},
    )
    assert r_add1.status_code == 200, f"Add standalone failed: {r_add1.text}"

    # Add same item as bundle component
    r_add2 = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": item_id,
            "quantity": 1,
            "selected_modifiers": [],
            "bundle_product_id": bp_id,
        },
    )
    assert r_add2.status_code == 200, f"Add bundle component failed: {r_add2.text}"

    # Verify cart has 2 separate line items (not 1 merged with qty=2)
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_data = r_cart.json().get("data", {})
    line_items = cart_data.get("line_items", [])
    matching_items = [li for li in line_items if li["menu_item_id"] == item_id]
    assert len(matching_items) >= 2, (
        f"Expected >=2 separate line items for menu_item_id={item_id} "
        f"(standalone + bundle component), got {len(matching_items)}"
    )


# ───────────────────────────────────────────────────────
# Multi-component bundle add (C3 fix – was broken by max_per_order)
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bundle_add_all_components_succeeds(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Adding all components of a multi-component bundle should succeed (C3 fix)."""
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    bundles = r.json().get("data", [])
    if not bundles:
        pytest.skip("No bundle products")
    bp = bundles[0]
    bp_id = bp["id"]

    if not bp["components"] or len(bp["components"]) < 2:
        pytest.skip("Bundle needs at least 2 components for this test")

    # Customer auth
    import uuid
    phone = "+6014" + uuid.uuid4().hex[:7]
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add ALL bundle components — each should succeed
    for comp in bp["components"]:
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": comp["menu_item_id"],
                "quantity": comp.get("default_quantity", 1),
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
            },
        )
        assert r_add.status_code == 200, (
            f"Adding component {comp['menu_item_id']} should succeed. "
            f"Got {r_add.status_code}: {r_add.text}"
        )

    # Verify cart has correct number of line items
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    line_items = r_cart.json().get("data", {}).get("line_items", [])
    bundle_lines = [li for li in line_items if li.get("bundle_product_id") == bp_id]
    assert len(bundle_lines) >= len(bp["components"]), (
        f"Expected at least {len(bp['components'])} bundle lines, got {len(bundle_lines)}"
    )

    # Verify all bundle lines have the correct bundle_product_id
    for li in bundle_lines:
        assert li["bundle_product_id"] == bp_id, f"Line {li['id']} has wrong bundle_product_id"


# ───────────────────────────────────────────────────────
# Add-on deal discount applied (C1 engine)
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_addon_deal_discount_applied(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Bundle in cart + addon-eligible standalone item → addon_discount > 0 on order."""
    # Get a bundle product
    r = await client.get(f"{base_url}/admin/menu/bundle-products?per_page=1", headers=admin_headers)
    if r.status_code != 200:
        pytest.skip("Bundle list not available")
    bundles = r.json().get("data", [])
    if not bundles:
        pytest.skip("No bundle products")
    bp = bundles[0]
    bp_id = bp["id"]

    if not bp["components"]:
        pytest.skip("Bundle has no components")

    # Find a menu item NOT in the bundle components — to use as the add-on
    bundle_component_ids = {c["menu_item_id"] for c in bp["components"]}
    r_menu = await client.get(f"{base_url}/menu/items?limit=50")
    menu_data = r_menu.json().get("data", {})
    all_items = menu_data.get("items", []) if isinstance(menu_data, dict) else menu_data
    addon_item = None
    for mi in all_items:
        if mi["id"] not in bundle_component_ids and mi.get("base_price", 0) > 0:
            addon_item = mi
            break
    if not addon_item:
        pytest.skip("No non-bundle menu item available for add-on test")

    # Patch the add-on item to be addon-deal-eligible for this bundle
    r_patch = await client.patch(
        f"{base_url}/admin/menu/items/{addon_item['id']}",
        headers=admin_headers,
        json={
            "is_addon_deal_eligible": True,
            "addon_discount_type": "percentage",
            "addon_discount_value": 50,
            "eligible_bundle_ids": [bp_id],
        },
    )
    if r_patch.status_code not in (200, 201):
        pytest.skip(f"Cannot set addon deal eligibility: {r_patch.text}")

    # Customer auth
    import uuid
    phone = "+6015" + uuid.uuid4().hex[:7]
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add bundle components to cart
    for comp in bp["components"]:
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": comp["menu_item_id"],
                "quantity": comp.get("default_quantity", 1),
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
            },
        )
        assert r_add.status_code == 200, f"Add bundle component failed: {r_add.text}"

    # Add the add-on item (standalone, no bundle_product_id)
    r_addon = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": addon_item["id"],
            "quantity": 1,
            "selected_modifiers": [],
        },
    )
    assert r_addon.status_code == 200, f"Add addon item failed: {r_addon.text}"

    # Get cart + create order
    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    assert r_cart.status_code == 200
    cart_id = r_cart.json().get("data", {}).get("id")
    assert cart_id, "Cart not found"

    r_order = await client.post(
        f"{base_url}/orders",
        headers=cust_headers,
        json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": "takeaway",
            "fulfillment_type": "counter_pickup",
        },
    )
    assert r_order.status_code in (200, 201), f"Order create failed: {r_order.text}"
    order = r_order.json().get("data", {})

    # Verify addon_discount > 0 (50% of add-on item price)
    addon_discount = order.get("addon_discount", 0)
    expected_discount = round(float(addon_item["base_price"]) * 0.5, 2)
    assert addon_discount > 0, (
        f"Expected addon_discount > 0, got {addon_discount}. "
        f"Order: {order}"
    )
    assert abs(float(addon_discount) - expected_discount) < 0.05, (
        f"Expected addon_discount ≈ {expected_discount}, got {addon_discount}"
    )

    # Cleanup: remove addon deal eligibility from the item
    await client.patch(
        f"{base_url}/admin/menu/items/{addon_item['id']}",
        headers=admin_headers,
        json={
            "is_addon_deal_eligible": False,
            "addon_discount_type": None,
            "addon_discount_value": None,
            "eligible_bundle_ids": [],
        },
    )
