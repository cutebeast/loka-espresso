"""
SEED SCRIPT: verify_seed_02_menu.py
Purpose: Create universal menu under store_id=0 (HQ)
APIs tested: POST /admin/stores/0/categories, POST /admin/stores/0/items, GET /stores/{id}/menu
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_01_stores.py (HQ store must exist at id=0)
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, admin_token, print_header
import db_validate


HQ_STORE_ID = 0


CATEGORIES = [
    {
        "name": "Signature Coffee",
        "slug": "signature-coffee",
        "items": [
            {"name": "Caramel Latte", "base_price": 12.90, "description": "Rich espresso with steamed milk and caramel syrup"},
            {"name": "Gula Melaka Latte", "base_price": 13.90, "description": "Signature latte with palm sugar syrup"},
            {"name": "Durian Cappuccino", "base_price": 16.90, "description": "Bold cappuccino with durian cream"},
        ],
    },
    {
        "name": "Espresso Bar",
        "slug": "espresso-bar",
        "items": [
            {"name": "Americano", "base_price": 8.90, "description": "Espresso with hot water", "is_featured": True},
            {"name": "Cappuccino", "base_price": 10.90, "description": "Classic Italian cappuccino", "is_featured": True},
            {"name": "Espresso", "base_price": 8.90, "description": "Double shot espresso"},
            {"name": "Flat White", "base_price": 11.90, "description": "Velvety microfoam over espresso", "is_featured": True},
            {"name": "Mocha", "base_price": 13.90, "description": "Espresso with chocolate and steamed milk"},
        ],
    },
    {
        "name": "Tea & Non-Coffee",
        "slug": "tea-non-coffee",
        "items": [
            {"name": "Teh Tarik", "base_price": 8.90, "description": "Pulled tea with condensed milk", "is_featured": True},
            {"name": "Matcha Latte", "base_price": 12.90, "description": "Japanese green tea latte"},
            {"name": "Cham", "base_price": 9.90, "description": "Coffee and tea blend"},
            {"name": "Iced Lemon Tea", "base_price": 8.90, "description": "Refreshing iced lemon tea"},
        ],
    },
    {
        "name": "Pastries & Toast",
        "slug": "pastries-toast",
        "items": [
            {"name": "Croissant", "base_price": 9.90, "description": "Buttery French croissant", "is_featured": True},
            {"name": "Kaya Toast", "base_price": 7.90, "description": "Classic Malaysian kaya toast"},
            {"name": "Chocolate Muffin", "base_price": 10.90, "description": "Rich chocolate chip muffin"},
            {"name": "Cheese Danish", "base_price": 11.90, "description": "Flaky pastry with cheese filling"},
        ],
    },
    {
        "name": "Specialties",
        "slug": "specialties",
        "items": [
            {"name": "Affogato", "base_price": 14.90, "description": "Espresso over vanilla ice cream", "is_featured": True},
            {"name": "Vanilla Latte", "base_price": 12.90, "description": "Latte with vanilla syrup"},
            {"name": "Kopi O Kosong", "base_price": 8.90, "description": "Strong black coffee with sugar"},
        ],
    },
    {
        "name": "Iced & Blended",
        "slug": "iced-blended",
        "items": [
            {"name": "Iced Chocolate", "base_price": 11.90, "description": "Chilled chocolate milk drink"},
            {"name": "Iced Caramel Latte", "base_price": 13.90, "description": "Chilled caramel latte over ice", "is_featured": True},
            {"name": "Frappe Mocha", "base_price": 14.90, "description": "Blended iced coffee with chocolate"},
        ],
    },
    {
        "name": "Food & Sandwiches",
        "slug": "food-sandwiches",
        "items": [
            {"name": "Chicken Sandwich", "base_price": 13.90, "description": "Grilled chicken with fresh vegetables"},
            {"name": "Tuna Wrap", "base_price": 12.90, "description": "Tuna salad wrap with lettuce"},
            {"name": "Egg Mayo Sandwich", "base_price": 10.90, "description": "Classic egg mayonnaise sandwich"},
        ],
    },
    {
        "name": "Desserts",
        "slug": "desserts",
        "items": [
            {"name": "Tiramisu", "base_price": 15.90, "description": "Italian coffee-flavoured dessert"},
            {"name": "Cheesecake", "base_price": 14.90, "description": "New York style cheesecake"},
            {"name": "Brownie", "base_price": 11.90, "description": "Rich chocolate brownie"},
        ],
    },
    {
        "name": "Merchandise",
        "slug": "merchandise",
        "items": [
            {"name": "Loka Tumbler", "base_price": 49.90, "description": "Branded reusable tumbler 450ml"},
            {"name": "Loka Pouch", "base_price": 29.90, "description": "Loka drawstring pouch bag"},
            {"name": "Loka Soft Toy", "base_price": 39.90, "description": "Cute Loka bear soft toy"},
            {"name": "Coaster Set", "base_price": 19.90, "description": "Pack of 4 Loka coasters"},
        ],
    },
    {
        "name": "Coffee Beans & Packs",
        "slug": "coffee-beans-packs",
        "items": [
            {"name": "Arabica Beans 250g", "base_price": 45.00, "description": "Premium single-origin arabica"},
            {"name": "Blend Pack", "base_price": 38.00, "description": "House blend 250g pack"},
            {"name": "Drip Coffee Set", "base_price": 55.00, "description": "Pour-over dripper + 100g beans"},
        ],
    },
]


def _get_cat_by_slug(slug, token):
    """Get category ID by slug using GET /stores/0/menu API."""
    resp = api_get(f"/stores/{HQ_STORE_ID}/menu", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    categories = data.get("categories", [])
    for c in categories:
        if c.get("slug") == slug:
            return c.get("id")
    return None


def _get_item_by_name(name, token):
    """Get menu item ID by name using GET /stores/0/menu API."""
    resp = api_get(f"/stores/{HQ_STORE_ID}/menu", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    categories = data.get("categories", [])
    for c in categories:
        for item in c.get("items", []):
            if item.get("name", "").lower() == name.lower():
                return item.get("id")
    return None


def run():
    print_header("STEP 02: Create Universal Menu (store_id=0)")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    print(f"[*] Validating HQ store (id={HQ_STORE_ID}) exists...")
    ok, _, msg = db_validate.validate_hq_store()
    if not ok:
        raise RuntimeError(f"HQ store validation failed: {msg}")
    print(f"  ✓ {msg}")

    created_categories = []
    print(f"\n[*] Creating {len(CATEGORIES)} menu categories via POST /admin/stores/0/categories...")
    for i, cat in enumerate(CATEGORIES, 1):
        existing_id = _get_cat_by_slug(cat["slug"], token)
        if existing_id:
            created_categories.append({**cat, "id": existing_id})
            print(f"  [{i}] {cat['name']} — already exists (id={existing_id})")
        else:
            resp = api_post(f"/admin/stores/{HQ_STORE_ID}/categories", token=token, json={
                "name": cat["name"],
                "slug": cat["slug"],
                "display_order": i,
            })
            if resp.status_code == 400 and "already exists" in resp.text:
                print(f"  [{i}] {cat['name']} — already exists")
            elif resp.status_code not in (200, 201):
                raise RuntimeError(f"Create category '{cat['name']}' failed: {resp.status_code} {resp.text}")
            else:
                data = resp.json()
                cat_id = data.get("id")
                created_categories.append({**cat, "id": cat_id})
                print(f"  [{i}] {cat['name']} — id={cat_id}")

    total_items = 0
    print(f"\n[*] Creating menu items via POST /admin/stores/0/items...")
    for cat in created_categories:
        for j, item in enumerate(cat["items"], 1):
            # Idempotent: check API first before creating
            existing_item_id = _get_item_by_name(item["name"], token)
            if existing_item_id is not None:
                continue
            resp = api_post(f"/admin/stores/{HQ_STORE_ID}/items", token=token, json={
                "name": item["name"],
                "category_id": cat["id"],
                "description": item.get("description", ""),
                "base_price": item["base_price"],
                "is_available": True,
                "is_featured": item.get("is_featured", False),
                "display_order": j,
            })
            if resp.status_code in (400, 500) and "already exists" in resp.text.lower():
                continue
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Create item '{item['name']}' failed: {resp.status_code} {resp.text}")
            total_items += 1
        print(f"  ✓ {cat['name']}: items processed")

    print(f"\n[*] Total: {len(created_categories)} categories, {total_items} items created")

    print("\n[*] DB Validation: menu categories...")
    ok, count, msg = db_validate.validate_menu_categories(HQ_STORE_ID, len(CATEGORIES))
    if not ok:
        raise RuntimeError(f"Menu categories validation failed: {msg}")
    print(f"  ✓ {msg}")

    print("\n[*] DB Validation: menu items...")
    ok, count, msg = db_validate.validate_menu_items(HQ_STORE_ID, total_items)
    if not ok:
        raise RuntimeError(f"Menu items validation failed: {msg}")
    print(f"  ✓ {msg}")

    # Fetch physical stores dynamically to use correct IDs
    stores_resp = api_get("/stores", token=token)
    physical_stores = []
    if stores_resp.status_code == 200:
        all_stores = stores_resp.json()
        physical_stores = [s for s in all_stores if s.get("id") != 0]

    store_a = physical_stores[0] if len(physical_stores) > 0 else {"id": 1, "name": "Store 1"}
    store_b = physical_stores[1] if len(physical_stores) > 1 else {"id": 2, "name": "Store 2"}

    print(f"\n[*] Validating universal menu via GET /stores/{store_a['id']}/menu ({store_a['name']})...")
    resp = api_get(f"/stores/{store_a['id']}/menu", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /stores/{store_a['id']}/menu failed: {resp.status_code}")
    menu_data = resp.json()
    returned_cats = len(menu_data.get("categories", []))
    returned_items = sum(len(c.get("items", [])) for c in menu_data.get("categories", []))
    print(f"  ✓ {store_a['name']} returns {returned_cats} categories, {returned_items} items from HQ menu")

    print(f"\n[*] Verifying universal menu is same across stores...")
    resp_a = api_get(f"/stores/{store_a['id']}/menu", token=token)
    resp_b = api_get(f"/stores/{store_b['id']}/menu", token=token)
    menu_a = resp_a.json()
    menu_b = resp_b.json()
    cats_a = len(menu_a.get("categories", []))
    cats_b = len(menu_b.get("categories", []))
    if cats_a == cats_b and cats_a > 0:
        print(f"  ✓ {store_a['name']} and {store_b['name']} return same menu ({cats_a} categories each)")
    else:
        raise RuntimeError(f"Universal menu mismatch: {store_a['name']}={cats_a}, {store_b['name']}={cats_b}")

    print("\n[✓] STEP 02 complete — universal menu created")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_02_menu.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
