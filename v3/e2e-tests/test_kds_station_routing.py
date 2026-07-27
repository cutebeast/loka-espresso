"""E2E tests for KDS station routing (bar vs kitchen) on GET /staff/orders.

Station map comes from the `kds.station_map` platform config (seeded by
seed_platform.py): drink categories route to "bar", "*" routes everything
unclaimed to "kitchen". A station filter keeps only orders with at least one
line item for that station and attaches an `items` list limited to that
station's lines.
"""

import httpx
import pytest


async def _pick_by_category(client: httpx.AsyncClient, base_url: str, slugs: list[str]):
    """Pick an available, priced menu item in one of the given category slugs."""
    r = await client.get(f"{base_url}/menu/categories?store_id=1")
    assert r.status_code == 200, r.text
    slug_to_id = {c["slug"]: c["id"] for c in r.json()["data"]["categories"]}
    wanted_ids = {slug_to_id[s] for s in slugs if s in slug_to_id}
    assert wanted_ids, f"none of {slugs} found in menu categories"
    r = await client.get(f"{base_url}/menu/stores/1")
    assert r.status_code == 200, r.text
    return next(
        i for i in r.json()["data"]["items"]
        if i["category_id"] in wanted_ids and i.get("is_available") and float(i.get("base_price") or 0) > 0
    )


async def _create_pos_order(client: httpx.AsyncClient, base_url: str, staff_headers: dict, item_ids: list[int]) -> int:
    r = await client.post(
        f"{base_url}/staff/pos/orders",
        headers=staff_headers,
        json={"order_type": "takeaway", "line_items": [{"menu_item_id": mid, "quantity": 1} for mid in item_ids]},
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    return data.get("order_id") or data["id"]


async def _station_orders(client: httpx.AsyncClient, base_url: str, staff_headers: dict, station: str) -> dict[int, dict]:
    r = await client.get(f"{base_url}/staff/orders?station={station}&per_page=200", headers=staff_headers)
    assert r.status_code == 200, r.text
    return {o["id"]: o for o in r.json()["data"]}


@pytest.mark.asyncio
async def test_kds_station_routing(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    """Bar/kitchen tabs split mixed orders; unknown station rejected."""
    bar_item = await _pick_by_category(client, base_url, ["cafe-specialty-coffee", "beverage"])
    kitchen_item = await _pick_by_category(client, base_url, ["main-courses", "pasta-creations", "gourmet-sandwiches"])

    bar_order = await _create_pos_order(client, base_url, staff_headers, [bar_item["id"]])
    kitchen_order = await _create_pos_order(client, base_url, staff_headers, [kitchen_item["id"]])
    mixed_order = await _create_pos_order(client, base_url, staff_headers, [bar_item["id"], kitchen_item["id"]])

    # Bar tab: bar-only + mixed orders; items limited to bar lines
    bar_by_id = await _station_orders(client, base_url, staff_headers, "bar")
    assert bar_order in bar_by_id
    assert mixed_order in bar_by_id
    assert kitchen_order not in bar_by_id
    assert [i["name"] for i in bar_by_id[mixed_order]["items"]] == [bar_item["item_name"]]

    # Kitchen tab: kitchen-only + mixed orders; items limited to kitchen lines
    kitchen_by_id = await _station_orders(client, base_url, staff_headers, "kitchen")
    assert kitchen_order in kitchen_by_id
    assert mixed_order in kitchen_by_id
    assert bar_order not in kitchen_by_id
    assert [i["name"] for i in kitchen_by_id[mixed_order]["items"]] == [kitchen_item["item_name"]]

    # Unknown station → 400
    r = await client.get(f"{base_url}/staff/orders?station=bogus", headers=staff_headers)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_kds_station_omitted_keeps_legacy_shape(client: httpx.AsyncClient, base_url: str, staff_headers: dict):
    """Without ?station the list keeps its legacy shape (no items key)."""
    r = await client.get(f"{base_url}/staff/orders?per_page=5", headers=staff_headers)
    assert r.status_code == 200, r.text
    orders = r.json()["data"]
    assert orders, "expected at least one order"
    assert all("items" not in o for o in orders)
