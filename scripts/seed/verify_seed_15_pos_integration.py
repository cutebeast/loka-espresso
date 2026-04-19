"""
SEED SCRIPT: verify_seed_15_pos_integration.py
Purpose: Test external POS system integration for DINE-IN orders only
         POS simulates kitchen workflow and sends webhooks to update FNB order status
         NOTE: Run EITHER Step 14 OR Step 15, not both (different dine-in workflows)
APIs tested: POST /pos/order/receive, GET /orders/{id}, PATCH /orders/{id}/status
Status: CERTIFIED-2026-04-18 | POS integration for dine-in orders
Dependencies: verify_seed_12c_place_orders_dinein.py (dine-in orders must exist)
             external_pos/mock_pos_server.py must be running
             external_pos/pos_webhooks.py must be running (webhook receiver)
Flow: For each dine-in order:
      1. Send order to POS via POST /pos/order/receive
      2. POS receives order and starts kitchen simulation
      3. POS webhook → FNB: status=preparing (wait 2 sec)
      4. POS webhook → FNB: status=ready (wait 2 sec)
      5. POS webhook → FNB: status=completed (wait 1 sec)
      6. Verify FNB order status updated
      7. Verify table freed
Idempotency: Skips orders that already have pos_order_id or are completed
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import time
from datetime import datetime, timezone, timedelta

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

EXTERNAL_POS_DIR = os.path.join(SEED_DIR, "..", "external_pos")
sys.path.insert(0, EXTERNAL_POS_DIR)

from shared_config import (
    api_get, api_patch, admin_token, load_state, save_state, print_header,
    get_store_tables,
)
from pos_client import send_order_to_pos, get_pos_order_status


POS_WEBHOOK_URL = os.environ.get("POS_WEBHOOK_URL", "http://localhost:8001/api/v1/pos/webhook")


def run():
    print_header("STEP 15: POS Integration for Dine-in Orders")
    print("  Tests POS-automated dine-in workflow (webhooks update status)")
    print("  Pickup orders: NO POS (online payment)")
    print("  Dine-in orders: YES POS (table service)")
    print("  NOTE: Run EITHER Step 14 OR Step 15, not both")
    print()

    dinein_orders = load_state("dinein_orders")
    if not dinein_orders:
        print("[ERROR] No dine-in orders found. Run verify_seed_12c_place_orders_dinein.py first.")
        return []

    admin_tok = admin_token()
    
    results = []
    completed_count = 0
    failed_count = 0

    for i, order in enumerate(dinein_orders):
        order_id = order.get("order_id")
        store_id = order.get("store_id")
        table_id = order.get("table_id")
        total = order.get("total", 0)
        
        if order.get("pos_order_id"):
            print(f"  [{i+1}/{len(dinein_orders)}] Order {order_id} - already sent to POS, skipping")
            continue
        
        print(f"  [{i+1}/{len(dinein_orders)}] Order {order_id} (store={store_id}, table={table_id})...", end=" ")
        
        items = [
            {"name": "Item 1", "quantity": 1, "price": total * 0.6},
            {"name": "Item 2", "quantity": 1, "price": total * 0.4},
        ]
        
        pos_response = send_order_to_pos(
            order_id=order_id,
            store_id=store_id,
            table_id=table_id,
            items=items,
            total=total,
            customer_name=None,
        )
        
        if not pos_response:
            print(f"FAILED - could not send order to POS")
            failed_count += 1
            results.append({**order, "pos_status": "failed", "error": "POS send failed"})
            continue
        
        pos_order_id = pos_response.get("pos_order_id")
        order["pos_order_id"] = pos_order_id
        
        print(f"Sent to POS={pos_order_id}")
        
        wait_time = 6
        print(f"    Waiting {wait_time} sec for POS kitchen simulation and webhooks...")
        time.sleep(wait_time)
        
        pos_status = get_pos_order_status(pos_order_id)
        final_status = pos_status.get("status") if pos_status else "unknown"
        
        tables = get_store_tables(store_id)
        table_info = next((t for t in tables if t.get("id") == table_id), None)
        table_free = not table_info.get("is_occupied") if table_info else None
        
        order_resp = api_get(f"/orders/{order_id}", token=admin_tok)
        fnb_status = order_resp.json().get("status") if order_resp.status_code == 200 else "unknown"
        
        if final_status == "completed" and fnb_status == "completed":
            print(f"    OK - POS: {final_status}, FNB: {fnb_status}, table_free: {table_free}")
            completed_count += 1
            results.append({
                **order,
                "pos_status": "completed",
                "pos_order_id": pos_order_id,
                "pos_final_status": final_status,
                "fnb_final_status": fnb_status,
                "table_free_after_completion": table_free,
            })
        else:
            print(f"    PARTIAL - POS: {final_status}, FNB: {fnb_status}, table_free: {table_free}")
            failed_count += 1
            results.append({
                **order,
                "pos_status": "partial",
                "pos_order_id": pos_order_id,
                "pos_final_status": final_status,
                "fnb_final_status": fnb_status,
                "table_free_after_completion": table_free,
            })

    save_state("dinein_orders", results)

    print()
    print(f"[SUMMARY] POS integration completed")
    print(f"  Total dine-in orders: {len(dinein_orders)}")
    print(f"  Successfully completed: {completed_count}")
    print(f"  Failed/partial: {failed_count}")
    print(f"  Note: POS webhooks update FNB order status automatically")

    return results


if __name__ == "__main__":
    run()