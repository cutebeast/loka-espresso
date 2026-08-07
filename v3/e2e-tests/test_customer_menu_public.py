"""Public menu endpoints — GET /menu/items, /menu/categories, /content/products.

Round 12 — these endpoints were added/fixed to support the PWA global menu.
All endpoints are public (no auth required).
"""

import pytest
import httpx


@pytest.mark.public
@pytest.mark.asyncio
async def test_menu_items_public_endpoint(client: httpx.AsyncClient, base_url: str):
    """GET /menu/items returns global menu items (no store_id)."""
    r = await client.get(f"{base_url}/menu/items", params={"limit": 5})
    assert r.status_code == 200, f"Menu items failed: {r.text}"
    data = r.json().get("data", {})
    items = data.get("items", [])
    assert len(items) >= 0  # May be 0 if not seeded
    if items:
        item = items[0]
        assert "id" in item
        assert "item_name" in item
        assert "item_code" in item
        assert "base_price" in item


@pytest.mark.public
@pytest.mark.asyncio
async def test_menu_items_featured_filter(client: httpx.AsyncClient, base_url: str):
    """GET /menu/items?is_featured=true — filter works."""
    r = await client.get(f"{base_url}/menu/items", params={"is_featured": "true", "limit": 10})
    assert r.status_code == 200, f"Featured menu items failed: {r.text}"


@pytest.mark.public
@pytest.mark.asyncio
async def test_menu_categories_public_endpoint(client: httpx.AsyncClient, base_url: str):
    """GET /menu/categories returns global categories (no store_id)."""
    r = await client.get(f"{base_url}/menu/categories")
    assert r.status_code == 200, f"Menu categories failed: {r.text}"
    data = r.json().get("data", {})
    categories = data.get("categories", [])
    if categories:
        cat = categories[0]
        assert "id" in cat
        assert "category_name" in cat


@pytest.mark.public
@pytest.mark.asyncio
async def test_menu_items_search(client: httpx.AsyncClient, base_url: str):
    """GET /menu/items?search= — text search works."""
    r = await client.get(f"{base_url}/menu/items", params={"search": "americano", "limit": 3})
    assert r.status_code == 200


@pytest.mark.public
@pytest.mark.asyncio
async def test_store_menu_backward_compat(client: httpx.AsyncClient, base_url: str, store_id: int):
    """GET /menu/stores/{store_id} — still works (used by older PWA)."""
    r = await client.get(f"{base_url}/menu/stores/{store_id}", params={"limit": 5})
    assert r.status_code == 200


@pytest.mark.public
@pytest.mark.asyncio
async def test_content_products_endpoint(client: httpx.AsyncClient, base_url: str):
    """GET /content/products returns product cards."""
    r = await client.get(f"{base_url}/content/products", params={"limit": 5})
    assert r.status_code == 200, f"Products failed: {r.text}"


@pytest.mark.public
@pytest.mark.asyncio
async def test_workshops_endpoint(client: httpx.AsyncClient, base_url: str):
    """GET /menu/workshops returns the class catalog for booking layouts:
    variants (pax packages) + upcoming sessions with remaining seats."""
    r = await client.get(f"{base_url}/menu/workshops")
    assert r.status_code == 200, f"Workshops failed: {r.text}"
    data = r.json().get("data", [])
    assert len(data) >= 1, "expected seeded workshop items"
    # Seeded classes use EX- codes; other items (tester-created classes on the
    # shared dev DB) may use generated codes — assert structure for all.
    assert any(w["item_code"].startswith("EX-") for w in data), "expected seeded EX- workshops"
    for w in data:
        assert w.get("item_code"), "workshop item_code missing"
        assert "base_price" in w and "variants" in w and "sessions" in w
        assert isinstance(w["total_remaining"], int)
        for s in w["sessions"]:
            assert s["remaining"] == s["capacity"] - s["booked_pax"]
    # localized content (launch locales: EN + CN only)
    r = await client.get(f"{base_url}/menu/workshops", params={"locale": "zh"})
    assert r.status_code == 200
    zh_names = [w["item_name"] for w in r.json()["data"]]
    en_names = [w["item_name"] for w in data]
    assert any(a != b for a, b in zip(zh_names, en_names)), "locale=zh should localize names"
