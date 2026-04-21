"""
SEED SCRIPT: verify_seed_16_place_discounted_orders.py
Purpose: Place orders using the claimed vouchers or rewards.
Constraints: 1 discount type per order.
"""
import os
import sys
import json
import random
import requests

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import API_BASE, load_state, save_state, get_store_menu_items, rand_date_within_days

SEED_STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

def get_stores(token):
    resp = requests.get(f"{API_BASE}/stores", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if resp.status_code != 200: return [], f"GET /stores failed: {resp.status_code}"
    return resp.json(), None

def get_menu(store_id, token):
    return get_store_menu_items(store_id, token)

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

def place_single_order(customer, redeemed_rewards, order_index=1):
    """Place a single discounted order for a customer."""
    user_id = customer.get("user_id")
    token = customer.get("token")
    name = customer.get("name")

    if not token:
        return None, "No token"

    # Check for discounts
    vouchers = customer.get("vouchers", [])
    rewards = redeemed_rewards.get(user_id, [])

    if not vouchers and not rewards:
        return None, "No vouchers or rewards available"

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

    print(f"[{name}] Order {order_index}/3 with {discount_name}")

    stores, err = get_stores(token)
    if not stores:
        return None, f"Failed to fetch stores: {err}"

    physical_stores = [s for s in stores if s.get("id") != 0]
    store = random.choice(physical_stores)
    store_id = store["id"]

    menu_items, err = get_menu(store_id, token)
    if not menu_items:
        return None, f"Failed to fetch menu: {err}"

    clear_cart(token)

    # Add random items (1-5 items)
    num_items = random.randint(1, 5)
    selected_items = random.sample(menu_items, min(num_items, len(menu_items)))
    for item in selected_items:
        add_to_cart(store_id, item["item_id"], 1, token)

    # Use date spreading over 60 days
    pickup_time = rand_date_within_days(days_back=60, hours_forward=4)
    order, err = place_order_with_discount(store_id, pickup_time, discount_payload, token)

    if err:
        return None, f"Failed to place order: {err}"

    print(
        f"  ✓ Order #{order['order_number']} placed. "
        f"Subtotal: {order.get('subtotal', 0)}, Discount: {order.get('discount', 0)}, Total: {order.get('total', 0)}"
    )
    return {
        "order_id": order["id"],
        "order_number": order["order_number"],
        "user_id": user_id,
        "token": token,
        "store_id": store_id,
        "order_type": "pickup",
        "discount_used": discount_name
    }, None


def run():
    print("\n" + "="*60)
    print("  STEP 16: Place Discounted Orders (3 per customer)")
    print("="*60 + "\n")

    state = load_state()
    if not state:
        print("[ERROR] No state file found.")
        return

    customers = state.get("customers", [])
    redeemed_rewards = {r["user_id"]: r["rewards"] for r in state.get("redeemed_rewards", [])}

    success_count = 0
    failed_count = 0
    discounted_orders = []

    for c in customers:
        user_id = c.get("user_id")
        vouchers = c.get("vouchers", [])
        rewards = redeemed_rewards.get(user_id, [])

        # Skip customers with no discounts
        if not vouchers and not rewards:
            continue

        # Place 3 orders per customer
        for order_idx in range(1, 4):
            order_result, err = place_single_order(c, redeemed_rewards, order_idx)
            if order_result:
                success_count += 1
                discounted_orders.append(order_result)
            else:
                failed_count += 1
                print(f"  ✗ {err}")

    # Save to state
    state["discounted_orders"] = discounted_orders
    save_state(None, state)
    
    print("\n[SUMMARY]")
    print(f"  Total successful: {success_count}")
    print(f"  Total failed: {failed_count}")
    if failed_count == 0 and success_count > 0:
        print("\n[SUCCESS] verify_seed_16_place_discounted_orders.py")

if __name__ == "__main__":
    run()
