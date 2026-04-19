"""
SEED SCRIPT: verify_seed_12b_place_orders_delivery.py
Purpose: Place DELIVERY order for a single customer (self-contained, no helpers)
APIs tested: 
  - GET /stores (get all stores)
  - GET /stores/{id}/menu (get menu)
  - DELETE /cart (clear cart)
  - POST /cart/items (add items to cart)
  - POST /orders (place order with delivery_address)
Status: CERTIFIED-2026-04-19 | Delivery order placement
Dependencies: verify_seed_10_register.py, verify_seed_11_wallet_topup.py
Flow:
  1. Fetch stores from API
  2. Customer selects store and enters delivery address
  3. Customer selects 2-5 random items from menu
  4. Clear cart
  5. Add items to cart
 6. Place delivery order
Usage:
  echo '{"user_id": 1, "name": "Test", "token": "xxx"}' | python3 verify_seed_12b_place_orders_delivery.py
  OR
  python3 verify_seed_12b_place_orders_delivery.py '{"user_id": 1, "name": "Test", "token": "xxx"}'
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
from shared_config import API_BASE

# Sample KL addresses for delivery (must be dict as API expects)
SAMPLE_ADDRESSES = [
    {"address": "1, Jalan Ampang, 50450 Kuala Lumpur", "lat": 3.1590, "lng": 101.7120},
    {"address": "15, Jalan Bukit Bintang, 55100 Kuala Lumpur", "lat": 3.1490, "lng": 101.7130},
    {"address": "8, Jalan Sultan Ismail, 50250 Kuala Lumpur", "lat": 3.1500, "lng": 101.7110},
    {"address": "22, Jalan Alor, 50200 Kuala Lumpur", "lat": 3.1480, "lng": 101.7100},
    {"address": "45, Jalan Imbi, 55100 Kuala Lumpur", "lat": 3.1460, "lng": 101.7150},
    {"address": "100, Jalan Tun Razak, 50400 Kuala Lumpur", "lat": 3.1630, "lng": 101.7200},
    {"address": "55, Jalan Ampang Hilir, 55000 Kuala Lumpur", "lat": 3.1610, "lng": 101.7300},
    {"address": "33, Jalan Ampang Jaya, 68000 Kuala Lumpur", "lat": 3.1650, "lng": 101.7350},
]


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


def place_order(store_id, delivery_address, token):
    """Place delivery order."""
    try:
        resp = requests.post(
            f"{API_BASE}/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "order_type": "delivery",
                "store_id": store_id,
                "delivery_address": delivery_address,
            },
            timeout=10
        )
        if resp.status_code not in (200, 201):
            return None, f"{resp.status_code} {resp.text[:100]}"
        return resp.json(), None
    except Exception as e:
        return None, str(e)


def place_delivery_order(customer):
    """
    Place a delivery order for a customer.
    
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
    
    # Select random delivery address (API expects dict with address field)
    delivery_address = random.choice(SAMPLE_ADDRESSES)
    
    # Step 2: Get menu
    menu_items, err = get_menu(store_id, token)
    if err:
        return {"success": False, "error": f"Menu fetch failed: {err}"}
    if not menu_items:
        return {"success": False, "error": "No menu items found"}
    
    # Step 3: Clear cart
    clear_cart(token)
    
    # Step 4: Add random items to cart (1-5 items)
    num_items = random.randint(1, 5)
    selected_items = random.sample(menu_items, min(num_items, len(menu_items)))
    
    for item in selected_items:
        quantity = random.randint(1, 2)
        success, err = add_to_cart(store_id, item["item_id"], quantity, token)
        if not success:
            return {"success": False, "error": f"Cart add failed for {item['name']}: {err}"}
    
    # Step 5: Place order
    order, err = place_order(store_id, delivery_address, token)
    if err:
        return {"success": False, "error": f"Order failed: {err}"}
    
    return {
        "success": True,
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_type": "delivery",
        "store_id": store_id,
        "store_name": store_name,
        "delivery_address": delivery_address,
        "items_count": len(selected_items),
        "subtotal": order.get("subtotal", 0),
    }


def run():
    """Main function - run with customer data passed via argv or stdin."""
    print()
    print("=" * 60)
    print("  STEP 12b: Place DELIVERY Order")
    print("=" * 60)
    print()
    
    # Read customer data
    if len(sys.argv) > 1:
        customer = json.loads(sys.argv[1])
    else:
        customer = json.loads(sys.stdin.read())
    
    print(f"Customer: {customer.get('name')} (ID={customer.get('user_id')})")
    print(f"Order Type: DELIVERY")
    print()
    
    # Place order
    result = place_delivery_order(customer)
    
    if result["success"]:
        print(f"✓ Order placed!")
        print(f"  Order #{result['order_number']} (ID={result['order_id']})")
        print(f"  Store: {result['store_name']}")
        print(f"  Items: {result['items_count']}")
        addr_str = result['delivery_address'].get('address', str(result['delivery_address']))
        print(f"  Delivery: {addr_str[:40]}...")
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
