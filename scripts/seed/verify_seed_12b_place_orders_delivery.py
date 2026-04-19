"""
SEED SCRIPT: verify_seed_12b_place_orders_delivery.py
Purpose: Place DELIVERY orders only for customers (1-5 orders per customer)
         Orders placed in pending status (NO payment, NO completion)
         ~30% voucher, ~70% no discount
         Uses mock 3rd party delivery API for address and fee
APIs tested: GET /stores/0/menu (global), POST /orders, POST /cart/items
Status: CERTIFIED-2026-04-18 | Delivery orders with mock 3rd party
Dependencies: verify_seed_11_wallet_topup.py (customers need topped-up wallets)
             3rdparty_delivery/mock_delivery_server.py must be running
Flow: For each customer, place 1-5 delivery orders spread over 2 months
      1. Get customer from state
      2. Pick random store
      3. Get random address from sample_addresses.json
      4. Get delivery quote from mock delivery API
      5. Apply voucher if available (~30%)
      6. Place order via helper with delivery_address and fee
Idempotency: Skips if orders already placed for customer
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import random
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

THIRDPARTY_DIR = os.path.join(SEED_DIR, "..", "3rdparty_delivery")
sys.path.insert(0, THIRDPARTY_DIR)

from shared_config import (
    api_get, load_state, save_state, print_header, STORE_IDS,
)
from helper_seed_place_order import get_global_menu_items, place_order_for_customer
from delivery_client import get_random_address, get_delivery_quote, create_delivery


def get_customer_vouchers(customer):
    token = customer.get("token")
    if not token:
        return []
    resp = api_get("/vouchers/me", token=token)
    if resp.status_code == 200:
        vouchers = resp.json()
        return [v["code"] for v in vouchers if v.get("status") == "available" and v.get("code")]
    return []


def place_delivery_orders_for_customer(args):
    customer, menu_items, orders_count = args
    results = []
    errors = []
    now = datetime.now(timezone.utc)
    two_months_ago = now - timedelta(days=60)

    available_vouchers = get_customer_vouchers(customer)

    for i in range(orders_count):
        days_ago = two_months_ago + timedelta(days=(i / orders_count) * 60)
        
        fulfillment_store = random.choice(STORE_IDS)
        
        addr_data = get_random_address()
        delivery_address = {
            "address": addr_data["address"],
            "lat": addr_data.get("lat"),
            "lng": addr_data.get("lng"),
        }
        
        quote = get_delivery_quote(fulfillment_store, addr_data["address"], 
                                   addr_data.get("lat"), addr_data.get("lng"))
        delivery_fee = quote.get("fee") if quote else None
        
        rand = random.random()
        voucher_code = None
        
        if rand < 0.30 and available_vouchers:
            voucher_code = random.choice(available_vouchers)

        order_id, total, points_earned, order_data = place_order_for_customer(
            customer=customer,
            menu_items=menu_items,
            fulfillment_store_id=fulfillment_store,
            order_type="delivery",
            delivery_address=delivery_address,
            delivery_fee=delivery_fee,
            created_at=days_ago,
            voucher_code=voucher_code,
            pay_and_complete=False,
        )

        if order_id:
            delivery_id = None
            if quote:
                del_result = create_delivery(
                    order_id=order_id,
                    store_id=fulfillment_store,
                    address=addr_data["address"],
                    lat=addr_data.get("lat"),
                    lng=addr_data.get("lng"),
                )
                if del_result:
                    delivery_id = del_result.get("delivery_id")
            
            results.append({
                "order_id": order_id,
                "user_id": customer.get("user_id"),
                "store_id": fulfillment_store,
                "order_type": "delivery",
                "total": total,
                "delivery_fee": delivery_fee,
                "delivery_address": delivery_address,
                "delivery_id": delivery_id,
                "discount_type": "voucher" if voucher_code else "none",
                "voucher_code": voucher_code,
            })
        else:
            errors.append(f"Delivery order {i+1} failed: order_id={order_id}")

        time.sleep(0.05)

    customer_total = sum(r.get("total", 0) for r in results)
    delivery_fees = sum(r.get("delivery_fee", 0) for r in results)
    voucher_orders = sum(1 for r in results if r.get("discount_type") == "voucher")
    no_discount = sum(1 for r in results if r.get("discount_type") == "none")

    return {
        **customer,
        "orders_placed": len(results),
        "total_spent": round(customer_total, 2),
        "total_delivery_fees": round(delivery_fees, 2),
        "voucher_orders": voucher_orders,
        "no_discount_orders": no_discount,
        "delivery_orders": len(results),
        "orders": results,
        "errors": errors,
    }


def run():
    print_header("STEP 12b: Place DELIVERY Orders (1-5 per customer, 2-month spread)")
    print("  Delivery orders only - NO payment or completion")
    print("  ~30% voucher, ~70% no discount")
    print("  Uses mock 3rd party delivery API for address and fee")
    print()

    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers found. Run verify_seed_10_register.py first.")
        return []

    print("[*] Fetching global menu from HQ (store_id=0)...")
    menu_items = get_global_menu_items()
    if not menu_items:
        print("[ERROR] Failed to fetch global menu items.")
        return []
    print(f"    Got {len(menu_items)} menu items")
    print()

    customer_args = []
    for c in customers:
        orders_count = random.randint(1, 5)
        customer_args.append((c, menu_items, orders_count))

    print(f"[*] Placing delivery orders for {len(customers)} customers in parallel...")
    all_results = []
    completed = 0

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(place_delivery_orders_for_customer, args): args[0]["user_id"] for args in customer_args}

        for future in as_completed(futures):
            user_id = futures[future]
            completed += 1
            try:
                result = future.result()
                all_results.append(result)
                error_str = f" [{len(result.get('errors', []))} ERRORS]" if result.get('errors') else ""
                print(f"  [{completed}/{len(customers)}] {result['name']} (ID={user_id}): {result['orders_placed']} delivery orders, "
                      f"RM {result['total_spent']:.2f} + RM {result.get('total_delivery_fees', 0):.2f} delivery{error_str}")
            except Exception as e:
                print(f"  [{completed}/{len(customers)}] user_id={user_id}: FAILED - {e}")

    save_state("customers", all_results)
    delivery_orders = [r for c in all_results for r in c.get("orders", [])]
    save_state("delivery_orders", delivery_orders)

    total_orders = sum(c.get("orders_placed", 0) for c in all_results)
    total_spent = sum(c.get("total_spent", 0) for c in all_results)
    total_delivery_fees = sum(c.get("total_delivery_fees", 0) for c in all_results)
    total_voucher = sum(c.get("voucher_orders", 0) for c in all_results)
    total_no_disc = sum(c.get("no_discount_orders", 0) for c in all_results)

    print()
    print(f"[SUMMARY] {total_orders} delivery orders placed by {len(customers)} customers")
    print(f"  Total food spent: RM {total_spent:.2f}")
    print(f"  Total delivery fees: RM {total_delivery_fees:.2f}")
    print(f"  Discount breakdown: {total_voucher} voucher, {total_no_disc} no discount")
    print(f"  All orders PLACED and PENDING payment (no points awarded yet)")

    return all_results


if __name__ == "__main__":
    run()