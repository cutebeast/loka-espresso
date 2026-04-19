"""
SEED SCRIPT: verify_seed_14_dinein_flow.py
Purpose: Verify dine-in orders and table occupancy workflow
         - Query dine-in orders from pending orders
         - Verify table assignment
         - Simulate order completion (staff serves → order ready → completed)
         - Verify table becomes free after completion
Status: NEW-2026-04-18
Dependencies: verify_seed_12_place_orders.py (needs dine_in orders)
NO direct DB inserts — ALL via API calls.
"""

import sys, os
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    api_get, api_patch, load_state, save_state, print_header, admin_token,
)


def get_table_status(store_id, table_id):
    """Get current status of a specific table."""
    resp = api_get(f"/stores/{store_id}/tables/{table_id}")
    if resp.status_code == 200:
        return resp.json()
    return None


def process_dinein_order(order):
    """Process a single dine-in order through the workflow."""
    order_id = order.get("order_id")
    store_id = order.get("store_id")
    table_id = order.get("table_id")
    
    result = {
        "order_id": order_id,
        "store_id": store_id,
        "table_id": table_id,
        "status": "pending",
        "table_occupied_before": None,
        "table_occupied_after": None,
        "error": None,
    }
    
    if not table_id:
        result["status"] = "skipped"
        result["error"] = "No table_id assigned"
        return result
    
    admin_tok = admin_token()
    
    table_before = get_table_status(store_id, table_id)
    if table_before:
        result["table_occupied_before"] = table_before.get("is_occupied", False)
    
    status_chain = [
        ("confirmed", None),
        ("preparing", None),
        ("ready", None),
        ("completed", datetime.now(timezone.utc).isoformat()),
    ]
    
    all_success = True
    for new_status, completed_ts in status_chain:
        payload = {"status": new_status}
        if completed_ts:
            payload["completed_at"] = completed_ts
        
        resp = api_patch(f"/orders/{order_id}/status", token=admin_tok, json=payload)
        if resp.status_code != 200:
            all_success = False
            result["error"] = f"Failed at status {new_status}: {resp.status_code}"
            break
    
    if all_success:
        result["status"] = "completed"
    
    table_after = get_table_status(store_id, table_id)
    if table_after:
        result["table_occupied_after"] = table_after.get("is_occupied", False)
    
    return result


def run():
    print_header("STEP 14: Dine-in Flow Verification")
    print("  Verifying table assignment and occupancy workflow")
    print()
    
    pending_orders = load_state("pending_orders")
    if not pending_orders:
        print("[ERROR] No pending orders found. Run verify_seed_12_place_orders.py first.")
        return []
    
    dinein_orders = [
        o for o in pending_orders
        if o.get("order_type") == "dine_in" and o.get("table_id")
    ]
    
    if not dinein_orders:
        print("[INFO] No dine-in orders found to process.")
        return []
    
    print(f"[*] Found {len(dinein_orders)} dine-in orders to process")
    print()
    
    results = []
    completed = 0
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(process_dinein_order, order): order.get("order_id")
            for order in dinein_orders
        }
        
        for future in as_completed(futures):
            order_id = futures[future]
            completed += 1
            try:
                result = future.result()
                results.append(result)
                status_marker = "✓" if result["status"] == "completed" else "✗"
                occ_before = result.get("table_occupied_before")
                occ_after = result.get("table_occupied_after")
                print(f"  [{completed}/{len(dinein_orders)}] {status_marker} Order {order_id}: "
                      f"table={result['table_id']}, occ_before={occ_before}, occ_after={occ_after}")
            except Exception as e:
                print(f"  [{completed}/{len(dinein_orders)}] ✗ Order {order_id}: FAILED - {e}")
                results.append({"order_id": order_id, "status": "error", "error": str(e)})
    
    save_state("dinein_results", results)
    
    successful = sum(1 for r in results if r["status"] == "completed")
    failed = sum(1 for r in results if r["status"] != "completed")
    
    tables_freed = sum(
        1 for r in results
        if r.get("table_occupied_before") == True and r.get("table_occupied_after") == False
    )
    
    print()
    print(f"[SUMMARY] Processed {len(dinein_orders)} dine-in orders")
    print(f"  Successful: {successful}")
    print(f"  Failed: {failed}")
    print(f"  Tables freed after completion: {tables_freed}")
    
    return results


if __name__ == "__main__":
    run()