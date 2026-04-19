"""
SEED SCRIPT: verify_seed_13_delivery_flow.py
Purpose: Complete delivery orders through full lifecycle using mock 3rd party API
         - Create delivery jobs via mock API
         - Simulate full delivery flow (driver assignment → pickup → transit → delivered)
         - Update order status to completed after delivery
Status: NEW-2026-04-18
Dependencies: verify_seed_12_place_orders.py (needs delivery orders)
NO direct DB inserts — ALL via API calls.
"""

import sys, os, time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

THIRDPARTY_DIR = os.path.join(SEED_DIR, "..", "3rdparty_delivery")
sys.path.insert(0, THIRDPARTY_DIR)

from shared_config import (
    api_get, api_patch, load_state, save_state, print_header, admin_token,
)
from delivery_client import (
    create_delivery_for_order, track_delivery, simulate_delivery_completion,
)


def process_delivery_order(order):
    """Process a single delivery order through the full lifecycle."""
    order_id = order.get("order_id")
    store_id = order.get("store_id")
    delivery_address = order.get("delivery_address")
    
    if not delivery_address:
        return {"order_id": order_id, "status": "skipped", "reason": "no delivery address"}
    
    result = {
        "order_id": order_id,
        "store_id": store_id,
        "delivery_id": None,
        "status": "pending",
        "error": None,
    }
    
    address = delivery_address.get("address")
    lat = delivery_address.get("lat")
    lng = delivery_address.get("lng")
    
    delivery = create_delivery_for_order(
        order_id=order_id,
        store_id=store_id,
        address=address,
        lat=lat,
        lng=lng,
    )
    
    if not delivery:
        result["status"] = "failed"
        result["error"] = "Failed to create delivery job"
        return result
    
    delivery_id = delivery.get("delivery_id")
    result["delivery_id"] = delivery_id
    result["delivery_fee"] = delivery.get("fee")
    
    completed = simulate_delivery_completion(delivery_id)
    if completed:
        result["status"] = "completed"
    else:
        result["status"] = "simulated"
    
    admin_tok = admin_token()
    completed_at = datetime.now(timezone.utc)
    status_resp = api_patch(
        f"/orders/{order_id}/status",
        token=admin_tok,
        json={
            "status": "completed",
            "completed_at": completed_at.isoformat(),
        }
    )
    
    if status_resp.status_code == 200:
        result["order_status"] = "completed"
    else:
        result["order_status"] = f"failed ({status_resp.status_code})"
    
    return result


def run():
    print_header("STEP 13: Delivery Flow Simulation")
    print("  Creating delivery jobs via mock API and simulating full lifecycle")
    print()
    
    pending_orders = load_state("pending_orders")
    if not pending_orders:
        print("[ERROR] No pending orders found. Run verify_seed_12_place_orders.py first.")
        return []
    
    delivery_orders = [
        o for o in pending_orders
        if o.get("order_type") == "delivery" and o.get("delivery_address")
    ]
    
    if not delivery_orders:
        print("[INFO] No delivery orders found to process.")
        return []
    
    print(f"[*] Found {len(delivery_orders)} delivery orders to process")
    print()
    
    results = []
    completed = 0
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(process_delivery_order, order): order.get("order_id")
            for order in delivery_orders
        }
        
        for future in as_completed(futures):
            order_id = futures[future]
            completed += 1
            try:
                result = future.result()
                results.append(result)
                status_marker = "✓" if result["status"] in ("completed", "simulated") else "✗"
                print(f"  [{completed}/{len(delivery_orders)}] {status_marker} Order {order_id}: "
                      f"delivery={result.get('delivery_id', 'N/A')}, status={result['status']}")
            except Exception as e:
                print(f"  [{completed}/{len(delivery_orders)}] ✗ Order {order_id}: FAILED - {e}")
                results.append({"order_id": order_id, "status": "error", "error": str(e)})
    
    save_state("delivery_results", results)
    
    successful = sum(1 for r in results if r["status"] in ("completed", "simulated"))
    failed = sum(1 for r in results if r["status"] not in ("completed", "simulated"))
    
    print()
    print(f"[SUMMARY] Processed {len(delivery_orders)} delivery orders")
    print(f"  Successful: {successful}")
    print(f"  Failed: {failed}")
    
    return results


if __name__ == "__main__":
    run()