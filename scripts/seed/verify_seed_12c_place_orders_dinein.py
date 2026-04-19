"""
SEED SCRIPT: verify_seed_12c_place_orders_dinein.py
Purpose: Place DINE-IN order for a single customer (self-contained, no helpers)
APIs tested: 
  - GET /stores (get all stores)
  - GET /stores/{id}/tables (get available tables)
  - POST /tables/scan (QR code scan)
  - GET /stores/{id}/menu (get menu)
  - DELETE /cart (clear cart)
  - POST /cart/items (add items to cart)
  - POST /orders (place order with table_id)
Status: CERTIFIED-2026-04-19 | Dine-in order placement with QR scan
Dependencies: verify_seed_10_register.py, verify_seed_11_wallet_topup.py
Flow:
  1. Fetch stores from API
  2. Get available tables for store
  3. Customer scans QR code at table (system gets store/table info)
  4. Customer selects 2-5 random items from menu
  5. Clear cart
  6. Add items to cart
  7. Place dine-in order
Usage:
  echo '{"user_id": 1, "name": "Test", "token": "xxx"}' | python3 verify_seed_12c_place_orders_dinein.py
  OR
  python3 verify_seed_12c_place_orders_dinein.py '{"user_id": 1, "name": "Test", "token": "xxx"}'
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import json
import random
import requests
from datetime import datetime, timezone

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import API_BASE, rand_date_within_days


def get_stores(token):
    """Get all stores from API."""
    try:
        resp = requests.get(
            f"{API_BASE}/stores",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code != 200:
            return [], f"GET /stores failed: {resp.status_code}"
        return resp.json(), None
    except Exception as e:
        return [], str(e)


def get_tables(store_id, token):
    """Get available tables for a store using GET /stores/{id}/tables API."""
    try:
        resp = requests.get(
            f"{API_BASE}/stores/{store_id}/tables",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code != 200:
            return [], f"GET /stores/{store_id}/tables failed: {resp.status_code}"
        
        tables = resp.json()
        # Filter for active tables with capacity > 0 (exclude PICKUP counter)
        available = [
            t for t in tables 
            if t.get("is_active", True) 
            and t.get("capacity", 0) > 0
        ]
        return available, None
    except Exception as e:
        return [], str(e)


def scan_table_qr(store_slug, table_id):
    """Scan QR code at table to get store and table info."""
    try:
        resp = requests.post(
            f"{API_BASE}/tables/scan",
            json={"store_slug": store_slug, "table_id": table_id},
            timeout=10
        )
        if resp.status_code != 200:
            return None, f"POST /tables/scan failed: {resp.status_code}"
        return resp.json(), None
    except Exception as e:
        return None, str(e)


def get_menu(store_id, token):
    """Get menu items for a store."""
    try:
        resp = requests.get(
            f"{API_BASE}/stores/{store_id}/menu",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code != 200:
            return [], f"GET /stores/{store_id}/menu failed: {resp.status_code}"
        
        items = []
        for cat in resp.json().get("categories", []):
            for item in cat.get("items", []):
                if item.get("is_available", True):
                    items.append({
                        "item_id": item["id"],
                        "name": item["name"],
                        "base_price": item.get("base_price", 0),
                    })
        return items, None
    except Exception as e:
        return [], str(e)


def clear_cart(token):
    """Clear customer's cart."""
    try:
        resp = requests.delete(
            f"{API_BASE}/cart",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        return resp.status_code in (200, 204)
    except Exception:
        return False


def add_to_cart(store_id, item_id, quantity, token):
    """Add item to cart."""
    try:
        resp = requests.post(
            f"{API_BASE}/cart/items",
            headers={"Authorization": f"Bearer {token}"},
            json={"store_id": store_id, "item_id": item_id, "quantity": quantity},
            timeout=10
        )
        if resp.status_code not in (200, 201):
            return False, f"{resp.status_code} {resp.text[:100]}"
        return True, None
    except Exception as e:
        return False, str(e)


def place_order(store_id, table_id, token, created_at=None):
    """Place dine-in order."""
    try:
        payload = {
            "order_type": "dine_in",
            "store_id": store_id,
            "table_id": table_id,
        }
        if created_at:
            payload["created_at"] = created_at.isoformat()
        resp = requests.post(
            f"{API_BASE}/orders",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10
        )
        if resp.status_code not in (200, 201):
            return None, f"{resp.status_code} {resp.text[:100]}"
        return resp.json(), None
    except Exception as e:
        return None, str(e)


def place_dinein_order(customer):
    """
    Place a dine-in order for a customer.
    
    Args:
        customer: dict with user_id, name, token
    
    Returns:
        dict with order details or error
    """
    token = customer.get("token")
    if not token:
        return {"success": False, "error": "No token"}
    
    # Step 1: Fetch stores from API
    stores, err = get_stores(token)
    if err:
        return {"success": False, "error": f"Failed to fetch stores: {err}"}
    if not stores:
        return {"success": False, "error": "No stores found"}
    
    # Filter for physical stores (skip HQ with id=0)
    physical_stores = [s for s in stores if s.get("id") != 0]
    if not physical_stores:
        return {"success": False, "error": "No physical stores found"}
    
    # Select random store
    store = random.choice(physical_stores)
    store_id = store["id"]
    store_name = store["name"]
    store_slug = store.get("slug", f"store-{store_id}")
    
    # Step 2: Get available tables
    tables, err = get_tables(store_id, token)
    if err:
        return {"success": False, "error": f"Failed to get tables: {err}"}
    if not tables:
        return {"success": False, "error": f"No available tables at store {store_id}"}
    
    # Select random table
    selected_table = random.choice(tables)
    table_id = selected_table["id"]
    table_number = selected_table.get("table_number")
    
    # Step 3: Scan QR code at table
    scan_result, err = scan_table_qr(store_slug, table_id)
    if err:
        return {"success": False, "error": f"QR scan failed: {err}"}
    
    # Step 4: Get menu
    menu_items, err = get_menu(store_id, token)
    if err:
        return {"success": False, "error": f"Menu fetch failed: {err}"}
    if not menu_items:
        return {"success": False, "error": "No menu items found"}
    
    # Step 5: Clear cart
    clear_cart(token)
    
    # Step 6: Add random items to cart (1-5 items)
    num_items = random.randint(1, 5)
    selected_items = random.sample(menu_items, min(num_items, len(menu_items)))
    
    for item in selected_items:
        quantity = random.randint(1, 2)
        success, err = add_to_cart(store_id, item["item_id"], quantity, token)
        if not success:
            return {"success": False, "error": f"Cart add failed for {item['name']}: {err}"}
    
    # Step 7: Place order with date spreading
    order_date = rand_date_within_days(days_back=60, hours_forward=4)
    order, err = place_order(store_id, table_id, token, created_at=order_date)
    if err:
        return {"success": False, "error": f"Order failed: {err}"}
    
    return {
        "success": True,
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_type": "dine_in",
        "store_id": store_id,
        "store_name": store_name,
        "table_id": table_id,
        "table_number": table_number,
        "items_count": len(selected_items),
        "subtotal": order.get("subtotal", 0),
    }


def run():
    """Main function - run with customer data passed via argv or stdin."""
    print()
    print("=" * 60)
    print("  STEP 12c: Place DINE-IN Order")
    print("=" * 60)
    print()
    
    # Read customer data
    if len(sys.argv) > 1:
        customer = json.loads(sys.argv[1])
    else:
        customer = json.loads(sys.stdin.read())
    
    print(f"Customer: {customer.get('name')} (ID={customer.get('user_id')})")
    print(f"Order Type: DINE-IN")
    print()
    
    # Place order
    result = place_dinein_order(customer)
    
    if result["success"]:
        print(f"✓ Order placed!")
        print(f"  Order #{result['order_number']} (ID={result['order_id']})")
        print(f"  Store: {result['store_name']}")
        print(f"  Table: {result['table_number']} (ID={result['table_id']})")
        print(f"  Items: {result['items_count']}")
        print(f"  Total: RM {result['subtotal']:.2f}")
        
        # Output JSON for orchestrator
        print("\n--- RESULT ---")
        print(json.dumps(result))
        sys.exit(0)
    else:
        print(f"✗ Failed: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    run()
