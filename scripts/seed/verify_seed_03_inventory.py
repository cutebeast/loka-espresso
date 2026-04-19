"""
SEED SCRIPT: verify_seed_03_inventory.py
Purpose: Create per-store inventory (10 categories × ~65 items × 5 stores)
APIs tested: POST /stores/{id}/inventory-categories, POST /stores/{id}/inventory, GET /stores/{id}/inventory
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_01_stores.py (stores must exist at ids 2-6)
Note: Inventory is per-store, NOT universal. Each store tracks its own stock.
Idempotency: Categories and items checked via GET /stores/{id}/inventory API before creating.
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, admin_token, print_header
import db_validate


# Physical store IDs from seed_01 (after HQ=0)
STORE_IDS = [2, 3, 4, 5, 6]


INVENTORY_CATEGORIES = [
    {
        "name": "Coffee Beans",
        "slug": "coffee-beans",
        "items": [
            {"name": "Arabica Beans", "unit": "kg", "current_stock": 25.0, "reorder_level": 5.0},
            {"name": "Robusta Beans", "unit": "kg", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Decaf Beans", "unit": "kg", "current_stock": 10.0, "reorder_level": 3.0},
            {"name": "Espresso Blend", "unit": "kg", "current_stock": 30.0, "reorder_level": 8.0},
            {"name": "Single Origin Ethiopia", "unit": "kg", "current_stock": 8.0, "reorder_level": 2.0},
            {"name": "Cold Brew Concentrate", "unit": "litre", "current_stock": 15.0, "reorder_level": 5.0},
            {"name": "Instant Coffee", "unit": "kg", "current_stock": 5.0, "reorder_level": 2.0},
        ],
    },
    {
        "name": "Milk & Cream",
        "slug": "milk-cream",
        "items": [
            {"name": "Whole Milk", "unit": "litre", "current_stock": 50.0, "reorder_level": 10.0},
            {"name": "Oat Milk", "unit": "litre", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Almond Milk", "unit": "litre", "current_stock": 15.0, "reorder_level": 3.0},
            {"name": "Soy Milk", "unit": "litre", "current_stock": 12.0, "reorder_level": 3.0},
            {"name": "Whipping Cream", "unit": "litre", "current_stock": 8.0, "reorder_level": 2.0},
            {"name": "Condensed Milk", "unit": "tin", "current_stock": 24.0, "reorder_level": 6.0},
        ],
    },
    {
        "name": "Syrups & Sauces",
        "slug": "syrups-sauces",
        "items": [
            {"name": "Sugar Syrup", "unit": "litre", "current_stock": 10.0, "reorder_level": 2.0},
            {"name": "Caramel Syrup", "unit": "litre", "current_stock": 8.0, "reorder_level": 2.0},
            {"name": "Chocolate Syrup", "unit": "litre", "current_stock": 6.0, "reorder_level": 2.0},
            {"name": "Vanilla Syrup", "unit": "litre", "current_stock": 7.0, "reorder_level": 2.0},
            {"name": "Hazelnut Syrup", "unit": "litre", "current_stock": 5.0, "reorder_level": 1.0},
            {"name": "Gula Melaka Syrup", "unit": "litre", "current_stock": 6.0, "reorder_level": 1.5},
        ],
    },
    {
        "name": "Tea & Matcha",
        "slug": "tea-matcha",
        "items": [
            {"name": "Matcha Powder", "unit": "kg", "current_stock": 3.0, "reorder_level": 0.5},
            {"name": "Black Tea Leaves", "unit": "kg", "current_stock": 5.0, "reorder_level": 1.0},
            {"name": "Green Tea Bags", "unit": "box", "current_stock": 10.0, "reorder_level": 2.0},
            {"name": "Cham Mix", "unit": "kg", "current_stock": 4.0, "reorder_level": 1.0},
            {"name": "Chamomile Tea", "unit": "box", "current_stock": 5.0, "reorder_level": 1.0},
        ],
    },
    {
        "name": "Bakery Supplies",
        "slug": "bakery-supplies",
        "items": [
            {"name": "Croissant Dough", "unit": "pcs", "current_stock": 40.0, "reorder_level": 10.0},
            {"name": "Kaya Jam", "unit": "kg", "current_stock": 5.0, "reorder_level": 1.0},
            {"name": "Chocolate Chips", "unit": "kg", "current_stock": 3.0, "reorder_level": 1.0},
            {"name": "Cake Flour", "unit": "kg", "current_stock": 10.0, "reorder_level": 2.0},
            {"name": "Butter", "unit": "kg", "current_stock": 8.0, "reorder_level": 2.0},
        ],
    },
    {
        "name": "Packaging",
        "slug": "packaging",
        "items": [
            {"name": "Cups Regular", "unit": "pcs", "current_stock": 500.0, "reorder_level": 100.0},
            {"name": "Cups Large", "unit": "pcs", "current_stock": 300.0, "reorder_level": 50.0},
            {"name": "Lids", "unit": "pcs", "current_stock": 800.0, "reorder_level": 100.0},
            {"name": "Paper Sleeves", "unit": "pcs", "current_stock": 400.0, "reorder_level": 50.0},
            {"name": "Bags Small", "unit": "pcs", "current_stock": 200.0, "reorder_level": 50.0},
            {"name": "Bags Medium", "unit": "pcs", "current_stock": 150.0, "reorder_level": 30.0},
            {"name": "Stirrers", "unit": "pcs", "current_stock": 1000.0, "reorder_level": 200.0},
            {"name": "Napkins", "unit": "pcs", "current_stock": 2000.0, "reorder_level": 500.0},
        ],
    },
    {
        "name": "Food Ingredients",
        "slug": "food-ingredients",
        "items": [
            {"name": "Chicken Breast", "unit": "kg", "current_stock": 5.0, "reorder_level": 2.0},
            {"name": "Tuna", "unit": "can", "current_stock": 24.0, "reorder_level": 6.0},
            {"name": "Eggs", "unit": "tray", "current_stock": 10.0, "reorder_level": 3.0},
            {"name": "Mayonnaise", "unit": "kg", "current_stock": 3.0, "reorder_level": 1.0},
            {"name": "Lettuce", "unit": "kg", "current_stock": 4.0, "reorder_level": 1.0},
            {"name": "Bread Loaf", "unit": "pcs", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Wrap Tortilla", "unit": "pcs", "current_stock": 30.0, "reorder_level": 10.0},
        ],
    },
    {
        "name": "Cleaning Supplies",
        "slug": "cleaning",
        "items": [
            {"name": "Dish Soap", "unit": "litre", "current_stock": 5.0, "reorder_level": 1.0},
            {"name": "Sanitizer", "unit": "litre", "current_stock": 3.0, "reorder_level": 1.0},
            {"name": "Kitchen Towels", "unit": "roll", "current_stock": 10.0, "reorder_level": 2.0},
            {"name": "Floor Cleaner", "unit": "litre", "current_stock": 4.0, "reorder_level": 1.0},
            {"name": "Gloves", "unit": "box", "current_stock": 5.0, "reorder_level": 1.0},
        ],
    },
    {
        "name": "Merchandise Stock",
        "slug": "merchandise-stock",
        "items": [
            {"name": "Loka Tumbler", "unit": "pcs", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Loka Pouch", "unit": "pcs", "current_stock": 25.0, "reorder_level": 5.0},
            {"name": "Loka Soft Toy", "unit": "pcs", "current_stock": 15.0, "reorder_level": 3.0},
            {"name": "Coaster Set", "unit": "set", "current_stock": 30.0, "reorder_level": 5.0},
            {"name": "Gift Box", "unit": "pcs", "current_stock": 20.0, "reorder_level": 5.0},
        ],
    },
    {
        "name": "Frozen & Chilled",
        "slug": "frozen-chilled",
        "items": [
            {"name": "Ice Cubes", "unit": "bag", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Frozen Croissants", "unit": "pcs", "current_stock": 30.0, "reorder_level": 10.0},
            {"name": "Frozen Brownies", "unit": "pcs", "current_stock": 20.0, "reorder_level": 5.0},
            {"name": "Cream Cheese", "unit": "kg", "current_stock": 3.0, "reorder_level": 1.0},
            {"name": "Frozen Berries", "unit": "kg", "current_stock": 5.0, "reorder_level": 2.0},
            {"name": "Whipped Cream Canister", "unit": "pcs", "current_stock": 10.0, "reorder_level": 3.0},
        ],
    },
]


def _get_inv_cat_by_slug(store_id, slug, token):
    """Get inventory category ID by slug using GET /stores/{id}/inventory API."""
    resp = api_get(f"/stores/{store_id}/inventory", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    # Handle both list and dict responses
    if isinstance(data, list):
        categories = data
    else:
        categories = data.get("categories", [])
    for c in categories:
        if c.get("slug") == slug:
            return c.get("id")
    return None


def _get_inv_item_by_name(store_id, name, token):
    """Get inventory item ID by name using GET /stores/{id}/inventory API."""
    resp = api_get(f"/stores/{store_id}/inventory", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    # Handle both list and dict responses
    if isinstance(data, list):
        categories = data
    else:
        categories = data.get("categories", [])
    for c in categories:
        for item in c.get("items", []):
            if item.get("name", "").lower() == name.lower():
                return item.get("id")
    return None


def run():
    print_header("STEP 03: Create Per-Store Inventory")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    total_cats = 0
    total_items = 0

    for store_id in STORE_IDS:
        print(f"\n[*] Store {store_id}: Creating {len(INVENTORY_CATEGORIES)} inventory categories...")
        created_cats = []
        for i, cat in enumerate(INVENTORY_CATEGORIES, 1):
            existing_id = _get_inv_cat_by_slug(store_id, cat["slug"], token)
            if existing_id:
                created_cats.append({**cat, "id": existing_id})
                print(f"  {cat['name']}: already exists (id={existing_id})")
                continue
            resp = api_post(f"/stores/{store_id}/inventory-categories", token=token, json={
                "name": cat["name"],
                "slug": cat["slug"],
                "display_order": i,
            })
            if resp.status_code == 400 and "already exists" in resp.text:
                print(f"  {cat['name']}: already exists")
                continue
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Create inventory category '{cat['name']}' for store {store_id} failed: {resp.status_code} {resp.text}")
            cat_data = resp.json()
            cat_id = cat_data.get("id")
            created_cats.append({**cat, "id": cat_id})
            total_cats += 1

        print(f"  Processed {len(created_cats)} categories. Creating items...")
        for cat in created_cats:
            for item in cat["items"]:
                # Idempotent: check DB first before creating
                existing_item_id = _get_inv_item_by_name(store_id, item["name"], token)
                if existing_item_id is not None:
                    continue
                resp = api_post(f"/stores/{store_id}/inventory", token=token, json={
                    "name": item["name"],
                    "category_id": cat["id"],
                    "current_stock": item["current_stock"],
                    "unit": item["unit"],
                    "reorder_level": item["reorder_level"],
                    "is_active": True,
                })
                if resp.status_code in (400, 500) and "already exists" in resp.text.lower():
                    continue
                if resp.status_code not in (200, 201):
                    raise RuntimeError(f"Create inventory item '{item['name']}' for store {store_id} failed: {resp.status_code} {resp.text}")
                total_items += 1
        print(f"  ✓ Store {store_id}: items processed")

    print(f"\n[*] Total: {total_cats} new categories, {total_items} new items across {len(STORE_IDS)} stores")

    print("\n[*] DB Validation: inventory categories...")
    for store_id in STORE_IDS:
        ok, count, msg = db_validate.validate_inventory_categories(store_id, len(INVENTORY_CATEGORIES))
        if not ok:
            raise RuntimeError(f"Inventory categories validation for store {store_id}: {msg}")
    print(f"  ✓ All {len(STORE_IDS)} stores have {len(INVENTORY_CATEGORIES)} inventory categories each")

    print("\n[*] DB Validation: inventory items...")
    for store_id in STORE_IDS:
        ok, count, msg = db_validate.validate_inventory_items(store_id, 30)  # min 30 items per store
        if not ok:
            raise RuntimeError(f"Inventory items validation for store {store_id}: {msg}")
    print(f"  ✓ All {len(STORE_IDS)} stores have inventory items (30+ each)")

    print("\n[✓] STEP 03 complete — per-store inventory created")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_03_inventory.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
