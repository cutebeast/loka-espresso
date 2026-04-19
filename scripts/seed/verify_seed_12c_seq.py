"""
Sequential dine-in order placement - for debugging.
"""
import sys, os, random, time
from datetime import datetime, timezone, timedelta
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_get, load_state, save_state, print_header, STORE_IDS,
    scan_table_qr, get_store_tables,
)
from helper_seed_place_order import get_global_menu_items, place_order_for_customer

STORE_SLUGS = {
    2: "loka-klcc",
    3: "loka-pavilion",
    4: "loka-cheras",
    5: "loka-pj",
    6: "loka-bangi",
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

def run():
    print_header("STEP 12c: Place DINE-IN Orders (SEQUENTIAL)")
    
    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers found")
        return []
    
    menu_items = get_global_menu_items()
    if not menu_items:
        print("[ERROR] Failed to fetch global menu items")
        return []
    print(f"Got {len(menu_items)} menu items")
    
    all_results = []
    for idx, customer in enumerate(customers):
        orders_count = random.randint(1, 5)
        results = []
        errors = []
        now = datetime.now(timezone.utc)
        two_months_ago = now - timedelta(days=60)
        available_vouchers = get_customer_vouchers(customer)
        
        for i in range(orders_count):
            days_ago = two_months_ago + timedelta(days=(i / max(orders_count, 1)) * 60)
            fulfillment_store = random.choice(STORE_IDS)
            available_tables = get_available_tables(fulfillment_store)
            
            if not available_tables:
                errors.append(f"No available tables at store {fulfillment_store}")
                continue
            
            table = random.choice(available_tables)
            table_id = table["id"]
            store_slug = STORE_SLUGS.get(fulfillment_store, f"store-{fulfillment_store}")
            
            scan_result = scan_table_qr(store_slug, table_id)
            if not scan_result:
                errors.append(f"QR scan failed for table {table_id}")
                continue
            
            voucher_code = random.choice(available_vouchers) if random.random() < 0.30 and available_vouchers else None
            
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
                    "order_type": "dine_in",
                    "table_id": table_id,
                    "total": total,
                })
            else:
                errors.append(f"Order {i+1} failed")
            
            time.sleep(0.1)
        
        all_results.append({
            **customer,
            "orders_placed": len(results),
            "total_spent": sum(r.get("total", 0) for r in results),
            "orders": results,
            "errors": errors,
        })
        print(f"  [{idx+1}/{len(customers)}] {customer['name']}: {len(results)} dine-in orders")
    
    save_state("customers", all_results)
    dinein_orders = [r for c in all_results for r in c.get("orders", [])]
    save_state("dinein_orders", dinein_orders)
    
    total_orders = sum(c.get("orders_placed", 0) for c in all_results)
    print(f"\n[SUCCESS] {total_orders} dine-in orders placed")
    return all_results

if __name__ == "__main__":
    run()
