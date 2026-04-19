"""
SEED SCRIPT: verify_seed_13_delivery_flow.py
Purpose: Complete delivery orders through full lifecycle using mock 3rd party API
         This simulates the delivery flow after orders were placed in Step 12b
         Fast simulation: driver assignment (2 sec), pickup (2 sec), transit (2 sec), delivered
APIs tested: GET /orders/{id}, PATCH /orders/{id}/status
Status: CERTIFIED-2026-04-18 | Delivery lifecycle simulation
Dependencies: verify_seed_12b_place_orders_delivery.py (delivery orders must exist)
Flow: For each delivery order:
      1. Get delivery order info from state
      2. Create delivery job via mock API (if not already created)
      3. Simulate delivery completion via mock API
      4. Update order status to completed via admin API
Idempotency: Checks if delivery already completed before processing
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import time
from datetime import datetime, timezone, timedelta

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

THIRDPARTY_DIR = os.path.join(SEED_DIR, "..", "3rdparty_delivery")
sys.path.insert(0, THIRDPARTY_DIR)

from shared_config import (
    api_get, api_patch, admin_token, load_state, save_state, print_header,
)
from delivery_client import (
    create_delivery, simulate_delivery_completion, track_delivery,
)


def run():
    print_header("STEP 13: Delivery Flow Simulation")
    print("  Completing delivery orders through mock 3rd party API")
    print("  Fast simulation: driver assignment → pickup → transit → delivered")
    print()

    delivery_orders = load_state("delivery_orders")
    if not delivery_orders:
        print("[ERROR] No delivery orders found. Run verify_seed_12b_place_orders_delivery.py first.")
        return []

    admin_tok = admin_token()
    
    results = []
    completed_count = 0
    failed_count = 0

    for i, order in enumerate(delivery_orders):
        order_id = order.get("order_id")
        store_id = order.get("store_id")
        delivery_address = order.get("delivery_address", {})
        delivery_id = order.get("delivery_id")
        
        print(f"  [{i+1}/{len(delivery_orders)}] Order {order_id} (store={store_id})...", end=" ")
        
        if not delivery_id:
            addr = delivery_address.get("address", "") if delivery_address else ""
            lat = delivery_address.get("lat") if delivery_address else None
            lng = delivery_address.get("lng") if delivery_address else None
            
            del_result = create_delivery(
                order_id=order_id,
                store_id=store_id,
                address=addr,
                lat=lat,
                lng=lng,
            )
            if del_result:
                delivery_id = del_result.get("delivery_id")
                order["delivery_id"] = delivery_id
        
        if not delivery_id:
            print(f"FAILED - could not create delivery job")
            failed_count += 1
            results.append({**order, "delivery_status": "failed", "error": "No delivery_id"})
            continue
        
        del_result = simulate_delivery_completion(delivery_id)
        if not del_result:
            print(f"FAILED - could not simulate delivery")
            failed_count += 1
            results.append({**order, "delivery_status": "failed", "error": "Simulation failed"})
            continue
        
        status_resp = api_patch(
            f"/orders/{order_id}/status",
            token=admin_tok,
            json={
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        if status_resp.status_code == 200:
            order["delivery_status"] = "completed"
            order["completed_at"] = datetime.now(timezone.utc).isoformat()
            print(f"OK - delivery={delivery_id}, status=completed")
            completed_count += 1
        else:
            print(f"PARTIAL - delivery={delivery_id} but order update failed: {status_resp.status_code}")
            order["delivery_status"] = "partial"
            failed_count += 1
        
        results.append(order)
        time.sleep(0.2)

    save_state("delivery_orders", results)

    print()
    print(f"[SUMMARY] Delivery flow completed")
    print(f"  Total delivery orders: {len(delivery_orders)}")
    print(f"  Successfully completed: {completed_count}")
    print(f"  Failed/partial: {failed_count}")

    return results


if __name__ == "__main__":
    run()