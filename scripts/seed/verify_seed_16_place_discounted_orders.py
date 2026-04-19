"""
SEED SCRIPT: verify_seed_16_place_discounted_orders.py
Purpose: Place orders using the claimed vouchers or rewards.
Constraints: 1 discount type per order.
"""
import os
import json
import random
import requests
from datetime import datetime, timezone, timedelta

# Configuration
API_BASE = os.environ.get("API_BASE", "https://admin.loyaltysystem.uk/api/v1")
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
SEED_STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

def load_state():
    if not os.path.exists(SEED_STATE_FILE): return None
    with open(SEED_STATE_FILE, "r") as f: return json.load(f)

def save_state(state):
    with open(SEED_STATE_FILE, "w") as f: json.dump(state, f, indent=2)

def get_stores(token):
    resp = requests.get(f"{API_BASE}/stores", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code != 200: return [], f"GET /stores failed: {resp.status_code}"
    return resp.json(), None

def get_menu(store_id, token):
    resp = requests.get(f"{API_BASE}/stores/{store_id}/menu", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code != 200: return [], f"GET /stores/{store_id}/menu failed: {resp.status_code}"
    items = []
    for cat in resp.json().get("categories", []):
        for item in cat.get("items", []):
            if item.get("is_available", True):
                items.append({"item_id": item["id"], "name": item["name"], "base_price": item.get("base_price", 0)})
    return items, None

def clear_cart(token):
    try:
        requests.delete(f"{API_BASE}/cart", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    except:
        pass

def add_to_cart(store_id, item_id, quantity, token):
    resp = requests.post(f"{API_BASE}/cart/items", headers={"Authorization": f"Bearer {token}"},
                         json={"store_id": store_id, "item_id": item_id, "quantity": quantity}, timeout=10)
    return resp.status_code in (200, 201)

def place_order_with_discount(store_id, pickup_time, discount_payload, token):
    payload = {
        "order_type": "pickup",
        "store_id": store_id,
        "pickup_time": pickup_time.isoformat(),
    }
    payload.update(discount_payload)
    
    resp = requests.post(f"{API_BASE}/orders", headers={"Authorization": f"Bearer {token}"}, json=payload, timeout=10)
    if resp.status_code not in (200, 201):
        return None, f"{resp.status_code} {resp.text[:100]}"
    return resp.json(), None

def run():
    print("\n" + "="*60)
    print("  STEP 16: Place Discounted Orders")
    print("="*60 + "\n")
    
    state = load_state()
    if not state:
        print("[ERROR] No state found.")
        return
    
    customers = state.get("customers", [])
    redeemed_rewards = {r["user_id"]: r["rewards"] for r in state.get("redeemed_rewards", [])}
    
    success_count = 0
    failed_count = 0
    discounted_orders = []

    for c in customers:
        user_id = c.get("user_id")
        token = c.get("token")
        name = c.get("name")
        
        if not token: continue
        
        # Check for discounts
        vouchers = c.get("vouchers", [])
        rewards = redeemed_rewards.get(user_id, [])
        
        if not vouchers and not rewards:
            continue
            
        # Pick one discount randomly to enforce constraint (1 discount per order)
        discount_payload = {}
        discount_name = ""
        
        if vouchers and rewards:
            if random.choice([True, False]):
                v = random.choice(vouchers)
                discount_payload = {"voucher_code": v["voucher_code"]}
                discount_name = f"Voucher: {v['source_name']} ({v['voucher_code']})"
            else:
                r = random.choice(rewards)
                discount_payload = {"reward_redemption_code": r["redemption_code"]}
                discount_name = f"Reward: {r['name']} ({r['redemption_code']})"
        elif vouchers:
            v = random.choice(vouchers)
            discount_payload = {"voucher_code": v["voucher_code"]}
            discount_name = f"Voucher: {v['source_name']} ({v['voucher_code']})"
        else:
            r = random.choice(rewards)
            discount_payload = {"reward_redemption_code": r["redemption_code"]}
            discount_name = f"Reward: {r['name']} ({r['redemption_code']})"
            
        print(f"[{name}] Attempting order with {discount_name}")
        
        stores, err = get_stores(token)
        if not stores:
            print(f"  ✗ Failed to fetch stores: {err}")
            failed_count += 1
            continue
            
        physical_stores = [s for s in stores if s.get("id") != 0]
        store = random.choice(physical_stores)
        store_id = store["id"]
        
        menu_items, err = get_menu(store_id, token)
        if not menu_items:
            print(f"  ✗ Failed to fetch menu: {err}")
            failed_count += 1
            continue
            
        clear_cart(token)
        
        # Add random items
        selected_items = random.sample(menu_items, min(3, len(menu_items)))
        for item in selected_items:
            add_to_cart(store_id, item["item_id"], 1, token)
            
        pickup_time = datetime.now(timezone.utc) + timedelta(hours=2)
        order, err = place_order_with_discount(store_id, pickup_time, discount_payload, token)
        
        if err:
            print(f"  ✗ Failed to place order: {err}")
            failed_count += 1
        else:
            print(f"  ✓ Order #{order['order_number']} placed successfully. Subtotal: {order.get('subtotal', 0)}, Discount: {order.get('discount_total', 0)}")
            success_count += 1
            discounted_orders.append({
                "order_id": order["id"],
                "order_number": order["order_number"],
                "user_id": user_id,
                "token": token,
                "store_id": store_id,
                "order_type": "pickup",
                "discount_used": discount_name
            })

    # Save to state
    state["discounted_orders"] = discounted_orders
    save_state(state)
    
    print("\n[SUMMARY]")
    print(f"  Total successful: {success_count}")
    print(f"  Total failed: {failed_count}")
    if failed_count == 0 and success_count > 0:
        print("\n[SUCCESS] verify_seed_16_place_discounted_orders.py")

if __name__ == "__main__":
    run()
