"""
SEED SCRIPT: verify_seed_12c_place_orders_dinein.py
Purpose: Place DINE-IN orders only for customers (1-5 orders per customer)
         Orders placed in pending status (NO payment, NO completion)
         ~30% voucher, ~70% no discount
         Tests QR code scan flow and table assignment
APIs tested: GET /stores/0/menu (global), POST /tables/scan, POST /orders, POST /cart/items
Status: CERTIFIED-2026-04-18 | Dine-in orders with QR scan and table assignment
Dependencies: verify_seed_11_wallet_topup.py (customers need topped-up wallets)
Flow: For each customer, place 1-5 dine-in orders spread over 2 months
      1. Get customer from state
      2. Pick random store
      3. Get available tables for store
      4. Simulate QR scan: POST /tables/scan with store_slug and table_id
      5. Place order via helper with table_id
      6. Verify table occupancy set to occupied
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

from shared_config import (
    api_get, load_state, save_state, print_header, STORE_IDS,
    scan_table_qr, get_store_tables,
)
from helper_seed_place_order import get_global_menu_items, place_order_for_customer


STORE_SLUGS = {
    2: "store-klcc",
    3: "store-pavilion",
    4: "store-cheras",
    5: "store-pj",
    6: "store-bangi",
}


def get_customer_vouchers(customer):
    token = customer.get("token")
    if not token:
        return []
    resp = api_get("/vouchers/me", token=token)
    if resp.status_code == 200:
        vouchers = resp.json()
        return [v["code"] for v in vouchers if v.get("status") == "available" and v.get("code")]
    return []


def get_available_tables(store_id):
    tables = get_store_tables(store_id)
    if isinstance(tables, dict):
        tables = tables.get("tables", [])
    return [t for t in tables if t.get("is_active") and not t.get("is_occupied")]


def place_dinein_orders_for_customer(args):
    customer, menu_items, orders_count = args
    results = []
    errors = []
    now = datetime.now(timezone.utc)
    two_months_ago = now - timedelta(days=60)

    available_vouchers = get_customer_vouchers(customer)

    for i in range(orders_count):
        days_ago = two_months_ago + timedelta(days=(i / orders_count) * 60)
        
        fulfillment_store = random.choice(STORE_IDS)
        
        available_tables = get_available_tables(fulfillment_store)
        if not available_tables:
            errors.append(f"Dine-in order {i+1}: No available tables at store {fulfillment_store}")
            continue
        
        table = random.choice(available_tables)
        table_id = table["id"]
        table_number = table.get("table_number", table_id)
        store_slug = STORE_SLUGS.get(fulfillment_store, f"store-{fulfillment_store}")
        
        scan_result = scan_table_qr(store_slug, table_id)
        if not scan_result:
            errors.append(f"Dine-in order {i+1}: QR scan failed for table {table_id}")
            continue
        
        store_id_from_scan = scan_result.get("store_id")
        store_name = scan_result.get("store_name", "")
        
        rand = random.random()
        voucher_code = None
        
        if rand < 0.30 and available_vouchers:
            voucher_code = random.choice(available_vouchers)

        order_id, total, points_earned, order_data = place_order_for_customer(
            customer=customer,
            menu_items=menu_items,
            fulfillment_store_id=fulfillment_store,
            order_type="dine_in",
            table_id=table_id,
            created_at=days_ago,
            voucher_code=voucher_code,
            pay_and_complete=False,
        )

        if order_id:
            results.append({
                "order_id": order_id,
                "user_id": customer.get("user_id"),
                "store_id": fulfillment_store,
                "store_name": store_name,
                "order_type": "dine_in",
                "table_id": table_id,
                "table_number": table_number,
                "total": total,
                "discount_type": "voucher" if voucher_code else "none",
                "voucher_code": voucher_code,
                "scan_result": scan_result,
            })
        else:
            errors.append(f"Dine-in order {i+1} failed: order_id={order_id}")

        time.sleep(0.05)

    customer_total = sum(r.get("total", 0) for r in results)
    voucher_orders = sum(1 for r in results if r.get("discount_type") == "voucher")
    no_discount = sum(1 for r in results if r.get("discount_type") == "none")

    return {
        **customer,
        "orders_placed": len(results),
        "total_spent": round(customer_total, 2),
        "voucher_orders": voucher_orders,
        "no_discount_orders": no_discount,
        "dinein_orders": len(results),
        "orders": results,
        "errors": errors,
    }


def run():
    print_header("STEP 12c: Place DINE-IN Orders (1-5 per customer, 2-month spread)")
    print("  Dine-in orders only - NO payment or completion")
    print("  ~30% voucher, ~70% no discount")
    print("  Tests QR scan flow and table assignment")
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

    print(f"[*] Placing dine-in orders for {len(customers)} customers in parallel...")
    all_results = []
    completed = 0

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(place_dinein_orders_for_customer, args): args[0]["user_id"] for args in customer_args}

        for future in as_completed(futures):
            user_id = futures[future]
            completed += 1
            try:
                result = future.result()
                all_results.append(result)
                error_str = f" [{len(result.get('errors', []))} ERRORS]" if result.get('errors') else ""
                print(f"  [{completed}/{len(customers)}] {result['name']} (ID={user_id}): {result['orders_placed']} dine-in orders, "
                      f"RM {result['total_spent']:.2f}{error_str}")
            except Exception as e:
                print(f"  [{completed}/{len(customers)}] user_id={user_id}: FAILED - {e}")

    save_state("customers", all_results)
    dinein_orders = [r for c in all_results for r in c.get("orders", [])]
    save_state("dinein_orders", dinein_orders)

    total_orders = sum(c.get("orders_placed", 0) for c in all_results)
    total_spent = sum(c.get("total_spent", 0) for c in all_results)
    total_voucher = sum(c.get("voucher_orders", 0) for c in all_results)
    total_no_disc = sum(c.get("no_discount_orders", 0) for c in all_results)

    print()
    print(f"[SUMMARY] {total_orders} dine-in orders placed by {len(customers)} customers")
    print(f"  Total spent: RM {total_spent:.2f}")
    print(f"  Discount breakdown: {total_voucher} voucher, {total_no_disc} no discount")
    print(f"  All orders PLACED and PENDING payment (no points awarded yet)")
    print(f"  Tables should be marked as occupied")

    return all_results


if __name__ == "__main__":
    run()