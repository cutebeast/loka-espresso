"""
SEED SCRIPT: verify_seed_12a_place_orders_pickup.py
Purpose: Place PICKUP order for a single customer (self-contained, no helpers)
APIs tested: 
  - GET /stores (get all stores)
  - GET /stores/{id}/menu (get menu)
  - DELETE /cart (clear cart)
  - POST /cart/items (add items to cart)
  - POST /orders (place order with pickup_time)
Status: CERTIFIED-2026-04-19 | Pickup order placement
Dependencies: verify_seed_10_register.py, verify_seed_11_wallet_topup.py
Flow:
  1. Fetch stores from API
  2. Customer selects store and pickup time
  3. Customer selects 2-5 random items from menu
  4. Clear cart
  5. Add items to cart
  6. Place pickup order
Usage:
  echo '{"user_id": 1, "name": "Test", "token": "xxx"}' | python3 verify_seed_12a_place_orders_pickup.py
  OR
  python3 verify_seed_12a_place_orders_pickup.py '{"user_id": 1, "name": "Test", "token": "xxx"}'
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import json
import random
import requests
from datetime import datetime, timezone, timedelta

# Configuration
API_BASE = os.environ.get("API_BASE", "https://admin.loyaltysystem.uk/api/v1")


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


def place_order(store_id, pickup_time, token):
    """Place pickup order."""
    try:
        resp = requests.post(
            f"{API_BASE}/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "order_type": "pickup",
                "store_id": store_id,
                "pickup_time": pickup_time.isoformat(),
            },
            timeout=10
        )
        if resp.status_code not in (200, 201):
            return None, f"{resp.status_code} {resp.text[:100]}"
        return resp.json(), None
    except Exception as e:
        return None, str(e)


def place_pickup_order(customer):
    """
    Place a pickup order for a customer.
    
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
    
    # Generate pickup time (1-4 hours from now)
    pickup_hours = random.randint(1, 4)
    pickup_time = datetime.now(timezone.utc) + timedelta(hours=pickup_hours)
    
    # Step 2: Get menu
    menu_items, err = get_menu(store_id, token)
    if err:
        return {"success": False, "error": f"Menu fetch failed: {err}"}
    if not menu_items:
        return {"success": False, "error": "No menu items found"}
    
    # Step 3: Clear cart
    clear_cart(token)
    
    # Step 4: Add random items to cart (2-5 items)
    num_items = random.randint(2, 5)
    selected_items = random.sample(menu_items, min(num_items, len(menu_items)))
    
    for item in selected_items:
        quantity = random.randint(1, 2)
        success, err = add_to_cart(store_id, item["item_id"], quantity, token)
        if not success:
            return {"success": False, "error": f"Cart add failed for {item['name']}: {err}"}
    
    # Step 5: Place order
    order, err = place_order(store_id, pickup_time, token)
    if err:
        return {"success": False, "error": f"Order failed: {err}"}
    
    return {
        "success": True,
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_type": "pickup",
        "store_id": store_id,
        "store_name": store_name,
        "pickup_time": pickup_time.isoformat(),
        "items_count": len(selected_items),
        "subtotal": order.get("subtotal", 0),
    }


def run():
    """Main function - run with customer data passed via argv or stdin."""
    print()
    print("=" * 60)
    print("  STEP 12a: Place PICKUP Order")
    print("=" * 60)
    print()
    
    # Read customer data
    if len(sys.argv) > 1:
        customer = json.loads(sys.argv[1])
    else:
        customer = json.loads(sys.stdin.read())
    
    print(f"Customer: {customer.get('name')} (ID={customer.get('user_id')})")
    print(f"Order Type: PICKUP")
    print()
    
    # Place order
    result = place_pickup_order(customer)
    
    if result["success"]:
        print(f"✓ Order placed!")
        print(f"  Order #{result['order_number']} (ID={result['order_id']})")
        print(f"  Store: {result['store_name']}")
        print(f"  Items: {result['items_count']}")
        print(f"  Pickup: {result['pickup_time'][:16]}")
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
