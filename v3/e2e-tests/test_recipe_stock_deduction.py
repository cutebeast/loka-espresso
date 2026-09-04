"""E2E regression: recipe-driven stock deduction on POS sales.

2026-08-17 root cause: menu_item_recipes had 0 rows (cleared 2026-07-21, never
re-seeded), so recipe-item sales deducted nothing and wastage wrote no
movement. After re-seeding, cancellations of orders created PRE-recipe
restored phantom stock — `_restore_stock_for_order` now reverses only the
NET amount actually deducted (movement ledger), never recipe-needs.

These tests skip gracefully when recipes aren't seeded (fresh infra).
"""

import pytest

RECIPE_ITEM_CODE = "CSC-ESPRESSO"
ING_CODE = "BEANS-ESP-1KG"


async def _get_stock(client, base_url, staff_headers, code: str) -> float:
    r = await client.get(f"{base_url}/staff/inventory?store_id=1", headers=staff_headers)
    data = r.json().get("data") or {}
    rows = data.get("items", []) if isinstance(data, dict) else data
    row = next((x for x in rows if x.get("item_code") == code), None)
    if row is None:
        return 0.0
    v = row.get("current_stock") or 0
    return float(v)


def _recipe_count(client, base_url: str) -> int:
    r = client.get(f"{base_url}/admin/menu/items?per_page=500&search={RECIPE_ITEM_CODE}")
    return r.status_code


@pytest.mark.asyncio
async def test_pos_sale_deducts_recipe_stock(client, base_url, staff_headers, admin_headers, store_id):
    """A POS sale of a recipe item writes an 'out' movement and lowers stock."""
    # Find the item + ingredient ids
    r = await client.get(f"{base_url}/staff/menu/items?store_id=1&per_page=500", headers=staff_headers)
    data = r.json().get("data") or []
    items = data if isinstance(data, list) else data.get("items", [])
    espresso = next((i for i in items if i.get("item_code") == RECIPE_ITEM_CODE), None)
    if espresso is None:
        pytest.skip("menu not seeded")
    # Check the item actually has a recipe
    r = await client.get(f"{base_url}/admin/menu/items/{espresso['id']}", headers=admin_headers)
    detail = r.json().get("data", {})
    recipes = (detail.get("recipes") if isinstance(detail, dict) else None) or []
    if not recipes:
        pytest.skip("recipes not seeded — run seed_menu.py --with-recipes")

    before = await _get_stock(client, base_url, staff_headers, ING_CODE)

    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": espresso["id"], "quantity": 1}]},
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["data"].get("order_id") or r.json()["data"]["id"]

    after_sale = await _get_stock(client, base_url, staff_headers, ING_CODE)
    assert after_sale < before, f"stock did not decrease on sale: {before} -> {after_sale}"

    # Cancel (unpaid two-stage order) — stock must return EXACTLY to baseline
    r = await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})
    assert r.status_code == 200, r.text
    after_cancel = await _get_stock(client, base_url, staff_headers, ING_CODE)
    assert after_cancel == before, f"cancel did not restore stock exactly: {before} -> {after_cancel}"


@pytest.mark.asyncio
async def test_cancel_never_inflates_beyond_deduction(client, base_url, staff_headers, admin_headers, store_id):
    """The restore guard: cancelling an order whose lines never deducted stock
    (e.g. items without recipes) must NOT mint phantom stock."""
    r = await client.get(f"{base_url}/staff/menu/items?store_id=1&per_page=500", headers=staff_headers)
    data = r.json().get("data") or []
    items = data if isinstance(data, list) else data.get("items", [])
    # Find an item WITHOUT a recipe (most drinks outside the 31 seeded ones)
    no_recipe = next((i for i in items if i.get("item_code") not in ("CSC-ESPRESSO",)), None)
    if no_recipe is None:
        pytest.skip("menu not seeded")
    r = await client.get(f"{base_url}/admin/menu/items/{no_recipe['id']}", headers=admin_headers)
    detail = r.json().get("data", {})
    if (detail.get("recipes") if isinstance(detail, dict) else None):
        pytest.skip("item unexpectedly has a recipe")

    before = await _get_stock(client, base_url, staff_headers, ING_CODE)
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": no_recipe["id"], "quantity": 1}]},
    )
    assert r.status_code == 201, r.text
    order_id = r.json()["data"].get("order_id") or r.json()["data"]["id"]
    r = await client.post(f"{base_url}/staff/orders/{order_id}/cancel", headers=staff_headers, json={"reason": "e2e"})
    assert r.status_code == 200, r.text
    after = await _get_stock(client, base_url, staff_headers, ING_CODE)
    assert after == before, f"phantom stock minted: {before} -> {after}"


@pytest.mark.asyncio
async def test_admin_save_requires_recipe(client, base_url, admin_headers, staff_headers):
    """Owner rule (2026-09-03, supersedes the 2026-08-17 silent auto-link):
    a non-experience menu item can NOT be created without a recipe, and an
    update that clears all recipes is rejected with the recipes intact."""
    code = f"EX-NORECIPE-{_short_hex()}"

    # Create without recipes → 400
    r = await client.post(
        f"{base_url}/admin/menu/items",
        headers=admin_headers,
        json={"item_code": code, "item_name": "No Recipe Probe", "category_id": 1, "base_price": 9.9},
    )
    assert r.status_code == 400, r.text

    # Create with a recipe → 201
    r = await client.get(f"{base_url}/admin/inventory/items?per_page=1", headers=admin_headers)
    inv_rows = r.json().get("data") or []
    inv_rows = inv_rows if isinstance(inv_rows, list) else inv_rows.get("items", [])
    inv_id = inv_rows[0]["id"]
    r = await client.post(
        f"{base_url}/admin/menu/items",
        headers=admin_headers,
        json={"item_code": code, "item_name": "No Recipe Probe", "category_id": 1, "base_price": 9.9,
              "recipes": [{"inventory_item_id": inv_id, "quantity_required": 1,
                           "unit_of_measure": "unit", "waste_factor": 0}]},
    )
    assert r.status_code == 201, r.text
    item_id = r.json()["data"]["id"]
    assert len(r.json()["data"].get("recipes") or []) == 1

    # Clearing all recipes → 400, and the recipe survives the rejected save
    r = await client.patch(
        f"{base_url}/admin/menu/items/{item_id}",
        headers=admin_headers,
        json={"recipes": []},
    )
    assert r.status_code == 400, r.text
    r = await client.get(f"{base_url}/admin/menu/items/{item_id}", headers=admin_headers)
    assert len(r.json()["data"].get("recipes") or []) == 1, "rejected clear must not drop recipes"

    # Name-only update still works
    r = await client.patch(
        f"{base_url}/admin/menu/items/{item_id}",
        headers=admin_headers,
        json={"item_name": "No Recipe Probe v2"},
    )
    assert r.status_code == 200, r.text

    # Cleanup
    await client.delete(f"{base_url}/admin/menu/items/{item_id}", headers=admin_headers)


def _short_hex():
    import uuid
    return "".join(c for c in uuid.uuid4().hex if c.isdigit())[:6]
