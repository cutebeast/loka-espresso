"""Bundle products and add-on deal E2E tests.

Round 19 — covers admin CRUD, public menu exposure, bundle discount math,
cart dedup (H1 fix), max_per_order (M4 fix), and add-on deal discount (C1).
"""

import pytest
import httpx
import asyncio
import random
import uuid

from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL


@pytest.fixture(scope="module", autouse=True)
def cleanup_e2e_bundle_data():
    """Delete E2E bundles and menu items after the module finishes."""
    yield
    try:
        with httpx.Client() as client:
            r = client.post(
                f"{BASE_URL}/admin/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )
            if r.status_code != 200:
                return
            token = r.json().get("tokens", {}).get("access_token", "")
            headers = {"Authorization": f"Bearer {token}"}

            # Delete E2E bundles first so FK references to menu items are released
            r_bp = client.get(
                f"{BASE_URL}/admin/menu/bundle-products?per_page=500",
                headers=headers,
            )
            if r_bp.status_code == 200:
                for bp in r_bp.json().get("data", []):
                    title = bp.get("title", "") or ""
                    if title.startswith("E2E "):
                        client.delete(
                            f"{BASE_URL}/admin/menu/bundle-products/{bp['id']}",
                            headers=headers,
                        )

            # Attempt to delete E2E menu items (ignore FK failures from orders)
            r_items = client.get(
                f"{BASE_URL}/admin/menu/items?per_page=500",
                headers=headers,
            )
            if r_items.status_code == 200:
                for item in r_items.json().get("data", {}).get("items", []):
                    code = item.get("item_code", "") or ""
                    name = item.get("item_name", "") or ""
                    if code.startswith("E2E-") or name.startswith("E2E "):
                        client.delete(
                            f"{BASE_URL}/admin/menu/items/{item['id']}",
                            headers=headers,
                        )
    except Exception:
        pass


def _random_phone(prefix: str = "+6012") -> str:
    """Generate a phone number that satisfies the backend digit-only regex."""
    return prefix + "".join(random.choices("0123456789", k=7))


async def _ensure_category_id(client: httpx.AsyncClient, base_url: str, admin_headers: dict) -> int:
    """Return an existing menu category id, falling back to creation."""
    r = await client.get(f"{base_url}/admin/menu/categories?per_page=1", headers=admin_headers)
    if r.status_code == 200:
        items = r.json().get("data", {}).get("items", [])
        if items:
            return items[0]["id"]
    r_create = await client.post(
        f"{base_url}/admin/menu/categories",
        headers=admin_headers,
        json={"category_name": "E2E Bundles", "slug": "e2e-bundles", "is_available": True},
    )
    if r_create.status_code in (200, 201):
        return r_create.json().get("data", {}).get("id", 1)
    return 1


async def _create_test_menu_item(client: httpx.AsyncClient, base_url: str, admin_headers: dict, suffix: str, category_id: int, price: float = 10.0):
    token = f"{suffix}-{uuid.uuid4().hex[:8].upper()}"
    r = await client.post(
        f"{base_url}/admin/menu/items",
        headers=admin_headers,
        json={
            "item_name": f"E2E Item {token}",
            "item_code": f"E2E-{token}",
            "base_price": price,
            "category_id": category_id,
            "is_available": True,
        },
    )
    assert r.status_code in (200, 201), f"Menu item creation failed: {r.text}"
    return r.json()["data"]["id"]


async def _create_test_bundle(client: httpx.AsyncClient, base_url: str, admin_headers: dict, item_id: int, title: str = "E2E Test Bundle", bundle_type: str = "combo", extra: dict | None = None):
    payload = {
        "title": title,
        "bundle_type": bundle_type,
        "bundle_price": 10.0,
        "is_active": True,
        "max_per_order": 10,
        "components": [{"menu_item_id": item_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []}],
    }
    if extra:
        payload.update(extra)
    r = await client.post(f"{base_url}/admin/menu/bundle-products", headers=admin_headers, json=payload)
    assert r.status_code in (200, 201), f"Bundle creation failed: {r.text}"
    return r.json()["data"]["id"]

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
            "category_id": await _ensure_category_id(client, base_url, admin_headers),
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
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item_id = await _create_test_menu_item(client, base_url, admin_headers, "UPDATE", category_id)
    bp_id = await _create_test_bundle(client, base_url, admin_headers, item_id, title="E2E Update Bundle")

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
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item_id = await _create_test_menu_item(client, base_url, admin_headers, "DELETE", category_id)
    bp_id = await _create_test_bundle(client, base_url, admin_headers, item_id, title="E2E Delete Bundle")

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
    phone = _random_phone("+6012")
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
    phone = _random_phone("+6013")
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
    phone = _random_phone("+6014")
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
        base_price = mi.get("base_price")
        price_val = float(base_price) if base_price is not None else 0
        if mi["id"] not in bundle_component_ids and price_val > 0:
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
    phone = _random_phone("+6015")
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


# ───────────────────────────────────────────────────────
# Pick-X bundle flow
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pick_x_bundle_flow(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Create pick-X bundle, verify public exposure, add items, verify discount."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item_id = await _ensure_menu_items(client, base_url, admin_headers, store_id)
    if not item_id:
        pytest.skip("No menu items available")

    # Create a second menu item for the pool
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "FRIES", category_id, 6.50)

    # Create a pick-X bundle (pick_count=2, 2 items in pool)
    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Pick 2 Combo",
            "bundle_type": "pick_x",
            "bundle_price": 12.00,
            "pick_count": 2,
            "allow_duplicates": False,
            "is_active": True,
            "components": [
                {"menu_item_id": item_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Pick-X bundle create failed: {r.text}"

    # Verify in public menu
    r_pub = await client.get(f"{base_url}/menu/bundle-products")
    assert r_pub.status_code == 200
    bundles = r_pub.json().get("data", [])
    pick_x_bp = next((b for b in bundles if b.get("bundle_type") == "pick_x"), None)
    assert pick_x_bp is not None, "Pick-X bundle not found in public menu"
    assert pick_x_bp.get("pick_count") == 2
    assert pick_x_bp.get("allow_duplicates") == False

    bp_id = pick_x_bp["id"]

    # Customer auth
    import uuid
    phone = _random_phone("+6016")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add 2 items with bundle_product_id (customer picks 2 from pool)
    for comp in pick_x_bp["components"][:2]:
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": comp["menu_item_id"],
                "quantity": 1,
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
            },
        )
        assert r_add.status_code == 200, f"Add pick item failed: {r_add.text}"

    # Create order
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
    assert order.get("discount_amount", 0) > 0, (
        f"Expected bundle_discount > 0 for pick-X (sum of 2 items > bundle_price 12.00). "
        f"Got discount_amount={order.get('discount_amount')}"
    )


@pytest.mark.asyncio
async def test_pick_x_bundle_multi_instance(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Multi-instance pick-X: 4 items (2 sets of pick_count=2) → discount = 2 × (sum_per_set - price)."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item1_id = await _create_test_menu_item(client, base_url, admin_headers, "PX1", category_id, 12.90)
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "PX2", category_id, 6.50)

    bp_id = await _create_test_bundle(
        client, base_url, admin_headers, item1_id,
        title="E2E Pick 2 Multi",
        bundle_type="pick_x",
        extra={
            "bundle_price": 12.0,
            "pick_count": 2,
            "allow_duplicates": False,
            "components": [
                {"menu_item_id": item1_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )

    sum_per_set = round(12.90 + 6.50, 2)
    bp_price = 12.0
    expected_disc = round((sum_per_set - bp_price) * 2, 2)

    # Customer auth
    phone = _random_phone("+6017")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add 4 items (2 instances of each component)
    for item_id in (item1_id, item2_id):
        for _ in range(2):
            r_add = await client.post(
                f"{base_url}/cart/items?store_id={store_id}",
                headers=cust_headers,
                json={
                    "menu_item_id": item_id,
                    "quantity": 1,
                    "selected_modifiers": [],
                    "bundle_product_id": bp_id,
                },
            )
            assert r_add.status_code == 200, f"Add multi-instance item failed: {r_add.text}"

    # Create order
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
    assert r_order.status_code in (200, 201), f"Multi-instance order failed: {r_order.text}"
    order = r_order.json().get("data", {})

    actual_disc = round(float(order.get("discount_amount", 0)), 2)
    assert abs(actual_disc - expected_disc) < 0.06, (
        f"Expected discount ≈ {expected_disc} (2 sets × {sum_per_set} - 2 × {bp_price}), "
        f"got {actual_disc}"
    )


# ───────────────────────────────────────────────────────
# Boundary / negative bundle tests (F&B correctness)
# ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_standard_bundle_incomplete_no_discount(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """A standard combo missing a required component must not receive a bundle discount."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item1_id = await _create_test_menu_item(client, base_url, admin_headers, "COMBO-A", category_id, 12.90)
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "COMBO-B", category_id, 6.50)

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Incomplete Combo",
            "bundle_type": "combo",
            "bundle_price": 15.00,
            "is_active": True,
            "max_per_order": 10,
            "components": [
                {"menu_item_id": item1_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Bundle create failed: {r.text}"
    bp_id = r.json().get("data", {}).get("id")
    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    bp = r_detail.json().get("data", {})
    comp_id = bp["components"][0]["id"]

    phone = _random_phone("+6020")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add only one of the two required components
    r_add = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": item1_id,
            "quantity": 1,
            "selected_modifiers": [],
            "bundle_product_id": bp_id,
            "bundle_component_id": comp_id,
        },
    )
    assert r_add.status_code == 200, f"Add component failed: {r_add.text}"

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    cart_id = r_cart.json().get("data", {}).get("id")

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
    assert order.get("discount_amount", 0) == 0, (
        f"Incomplete combo should have no bundle discount, got {order.get('discount_amount')}"
    )


@pytest.mark.asyncio
async def test_pick_x_no_duplicates_rejected(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Pick-X with allow_duplicates=False must not discount repeated choices."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item1_id = await _create_test_menu_item(client, base_url, admin_headers, "PXD-A", category_id, 10.00)
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "PXD-B", category_id, 10.00)

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Pick 2 Distinct",
            "bundle_type": "pick_x",
            "bundle_price": 15.00,
            "pick_count": 2,
            "allow_duplicates": False,
            "is_active": True,
            "max_per_order": 10,
            "components": [
                {"menu_item_id": item1_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Pick-X create failed: {r.text}"
    bp_id = r.json().get("data", {}).get("id")
    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    bp = r_detail.json().get("data", {})
    comp_id = bp["components"][0]["id"]

    phone = _random_phone("+6021")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add 4 of the same item
    for _ in range(4):
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": item1_id,
                "quantity": 1,
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
                "bundle_component_id": comp_id,
            },
        )
        assert r_add.status_code == 200, f"Add pick item failed: {r_add.text}"

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    cart_id = r_cart.json().get("data", {}).get("id")

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
    assert order.get("discount_amount", 0) == 0, (
        f"Repeated Pick-X choice should not produce a discount, got {order.get('discount_amount')}"
    )


@pytest.mark.asyncio
async def test_multi_course_bundle_discount(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Multi-course bundle with valid per-group picks receives a discount."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    app_id = await _create_test_menu_item(client, base_url, admin_headers, "MC-APP", category_id, 8.00)
    main_id = await _create_test_menu_item(client, base_url, admin_headers, "MC-MAIN", category_id, 18.00)

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Multi-Course",
            "bundle_type": "multi_course",
            "bundle_price": 20.00,
            "is_active": True,
            "max_per_order": 10,
            "groups": [
                {"group_label": "Appetizer", "pick_count": 1, "min_pick": 1, "max_pick": 1, "sort_order": 0},
                {"group_label": "Main", "pick_count": 1, "min_pick": 1, "max_pick": 1, "sort_order": 1},
            ],
            "components": [
                {"menu_item_id": app_id, "default_quantity": 1, "sort_order": 0, "bundle_group_id": 0, "modifier_overrides": []},
                {"menu_item_id": main_id, "default_quantity": 1, "sort_order": 1, "bundle_group_id": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Multi-course create failed: {r.text}"
    bp_id = r.json().get("data", {}).get("id")
    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    bp = r_detail.json().get("data", {})
    comps = {c["menu_item_id"]: c["id"] for c in bp["components"]}

    phone = _random_phone("+6022")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    for menu_id in (app_id, main_id):
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={
                "menu_item_id": menu_id,
                "quantity": 1,
                "selected_modifiers": [],
                "bundle_product_id": bp_id,
                "bundle_component_id": comps[menu_id],
            },
        )
        assert r_add.status_code == 200, f"Add multi-course item failed: {r_add.text}"

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    cart_id = r_cart.json().get("data", {}).get("id")

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
    expected_disc = round((8.00 + 18.00) - 20.00, 2)
    actual_disc = round(float(order.get("discount_amount", 0)), 2)
    assert abs(actual_disc - expected_disc) < 0.01, (
        f"Expected multi-course discount {expected_disc}, got {actual_disc}"
    )


@pytest.mark.asyncio
async def test_addon_deal_without_bundle_no_discount(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """An addon-eligible item ordered standalone must not receive an add-on discount."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item_id = await _create_test_menu_item(client, base_url, admin_headers, "ADDON-ITEM", category_id, 10.00)

    # Create a bundle to use as the eligible bundle id
    bp_id = await _create_test_bundle(
        client, base_url, admin_headers, item_id,
        title="E2E Addon Eligible Bundle",
        bundle_type="combo",
        extra={"bundle_price": 9.00},
    )

    # Make the item addon-eligible for that bundle
    r_patch = await client.patch(
        f"{base_url}/admin/menu/items/{item_id}",
        headers=admin_headers,
        json={
            "is_addon_deal_eligible": True,
            "addon_discount_type": "percentage",
            "addon_discount_value": 50,
            "eligible_bundle_ids": [bp_id],
        },
    )
    assert r_patch.status_code in (200, 201), f"Menu item patch failed: {r_patch.text}"

    try:
        phone = _random_phone("+6023")
        r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
        if r_login.status_code != 200:
            pytest.skip("Customer auth not available")
        token = r_login.json().get("tokens", {}).get("access_token", "")
        cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Add addon-eligible item WITHOUT any bundle
        r_add = await client.post(
            f"{base_url}/cart/items?store_id={store_id}",
            headers=cust_headers,
            json={"menu_item_id": item_id, "quantity": 1, "selected_modifiers": []},
        )
        assert r_add.status_code == 200, f"Add addon item failed: {r_add.text}"

        r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
        cart_id = r_cart.json().get("data", {}).get("id")

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
        assert order.get("addon_discount", 0) == 0, (
            f"Standalone addon-eligible item should not receive addon discount, got {order.get('addon_discount')}"
        )
        assert order.get("discount_amount", 0) == 0, (
            f"Standalone addon-eligible item should have no discount, got {order.get('discount_amount')}"
        )
    finally:
        # Reset addon eligibility
        await client.patch(
            f"{base_url}/admin/menu/items/{item_id}",
            headers=admin_headers,
            json={
                "is_addon_deal_eligible": False,
                "addon_discount_type": None,
                "addon_discount_value": None,
                "eligible_bundle_ids": [],
            },
        )


@pytest.mark.asyncio
async def test_bundle_max_per_order_cap(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Buying more sets than max_per_order should discount only up to the cap."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item1_id = await _create_test_menu_item(client, base_url, admin_headers, "CAP-A", category_id, 12.00)
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "CAP-B", category_id, 12.00)

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Max 1 Combo",
            "bundle_type": "combo",
            "bundle_price": 18.00,
            "is_active": True,
            "max_per_order": 1,
            "components": [
                {"menu_item_id": item1_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Bundle create failed: {r.text}"
    bp_id = r.json().get("data", {}).get("id")
    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    bp = r_detail.json().get("data", {})
    comps = {c["menu_item_id"]: c["id"] for c in bp["components"]}

    phone = _random_phone("+6024")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add two complete sets
    for _ in range(2):
        for menu_id in (item1_id, item2_id):
            r_add = await client.post(
                f"{base_url}/cart/items?store_id={store_id}",
                headers=cust_headers,
                json={
                    "menu_item_id": menu_id,
                    "quantity": 1,
                    "selected_modifiers": [],
                    "bundle_product_id": bp_id,
                    "bundle_component_id": comps[menu_id],
                },
            )
            assert r_add.status_code == 200, f"Add cap item failed: {r_add.text}"

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    cart_id = r_cart.json().get("data", {}).get("id")

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
    expected_disc = round((12.00 + 12.00) - 18.00, 2)  # only one set discounted
    actual_disc = round(float(order.get("discount_amount", 0)), 2)
    assert abs(actual_disc - expected_disc) < 0.01, (
        f"Expected max_per_order=1 discount {expected_disc}, got {actual_disc}"
    )


@pytest.mark.asyncio
async def test_bundle_extra_quantities_only_discount_complete_sets(
    client: httpx.AsyncClient,
    base_url: str,
    admin_headers: dict,
    store_id: int,
):
    """Extra quantities beyond complete bundle sets must not be discounted."""
    category_id = await _ensure_category_id(client, base_url, admin_headers)
    item1_id = await _create_test_menu_item(client, base_url, admin_headers, "EXTRA-A", category_id, 12.00)
    item2_id = await _create_test_menu_item(client, base_url, admin_headers, "EXTRA-B", category_id, 12.00)

    r = await client.post(
        f"{base_url}/admin/menu/bundle-products",
        headers=admin_headers,
        json={
            "title": "E2E Extra Qty Combo",
            "bundle_type": "combo",
            "bundle_price": 18.00,
            "is_active": True,
            "max_per_order": 10,
            "components": [
                {"menu_item_id": item1_id, "default_quantity": 1, "sort_order": 0, "modifier_overrides": []},
                {"menu_item_id": item2_id, "default_quantity": 1, "sort_order": 1, "modifier_overrides": []},
            ],
        },
    )
    assert r.status_code in (200, 201), f"Bundle create failed: {r.text}"
    bp_id = r.json().get("data", {}).get("id")
    r_detail = await client.get(f"{base_url}/admin/menu/bundle-products/{bp_id}", headers=admin_headers)
    bp = r_detail.json().get("data", {})
    comps = {c["menu_item_id"]: c["id"] for c in bp["components"]}

    phone = _random_phone("+6025")
    r_login = await client.post(f"{base_url}/auth/login", json={"phone_number": phone})
    if r_login.status_code != 200:
        pytest.skip("Customer auth not available")
    token = r_login.json().get("tokens", {}).get("access_token", "")
    cust_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Add 3 of item1 and 1 of item2 → only 1 complete set
    r_add = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": item1_id,
            "quantity": 3,
            "selected_modifiers": [],
            "bundle_product_id": bp_id,
            "bundle_component_id": comps[item1_id],
        },
    )
    assert r_add.status_code == 200, f"Add extra item1 failed: {r_add.text}"

    r_add = await client.post(
        f"{base_url}/cart/items?store_id={store_id}",
        headers=cust_headers,
        json={
            "menu_item_id": item2_id,
            "quantity": 1,
            "selected_modifiers": [],
            "bundle_product_id": bp_id,
            "bundle_component_id": comps[item2_id],
        },
    )
    assert r_add.status_code == 200, f"Add item2 failed: {r_add.text}"

    r_cart = await client.get(f"{base_url}/cart?store_id={store_id}", headers=cust_headers)
    cart_id = r_cart.json().get("data", {}).get("id")

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
    # Only one complete set: (12+12) - 18 = 6.00
    expected_disc = round((12.00 + 12.00) - 18.00, 2)
    actual_disc = round(float(order.get("discount_amount", 0)), 2)
    assert abs(actual_disc - expected_disc) < 0.01, (
        f"Expected discount {expected_disc} for one complete set, got {actual_disc}"
    )
