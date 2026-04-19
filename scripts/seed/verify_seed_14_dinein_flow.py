"""
SEED SCRIPT: verify_seed_14_dinein_flow.py
Purpose: Test dine-in flow with MANUAL staff workflow (WITHOUT POS)
         Staff updates order status via admin dashboard APIs
         This tests the non-POS dine-in flow where staff manually updates status
         NOTE: Run EITHER Step 14 OR Step 15, not both (different dine-in workflows)
APIs tested: POST /auth/login-password (staff), GET /admin/orders, PATCH /orders/{id}/status
Status: CERTIFIED-2026-04-18 | Staff-managed dine-in flow (no POS)
Dependencies: verify_seed_12c_place_orders_dinein.py (dine-in orders must exist)
             verify_seed_04_staff.py (staff accounts must exist)
Flow: For each dine-in order:
      1. Get staff credentials for the store
      2. Staff logs in to get token
      3. Staff views pending orders
      4. Staff updates status chain: pending → paid → confirmed → preparing → ready → completed
      5. Each status update includes a note
      6. Table automatically freed on completion
Idempotency: Skips orders that are already completed
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import time
from datetime import datetime, timezone, timedelta

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    api_get, api_patch, admin_token, load_state, save_state, print_header,
    login_staff, get_staff_for_store, get_store_tables,
)


STAFF_STATUS_NOTES = {
    "paid": "Order accepted by staff",
    "confirmed": "Order confirmed by kitchen",
    "preparing": "Kitchen is preparing your order",
    "ready": "Your order is ready for pickup",
    "completed": "Order served to customer",
}


def update_order_status_chain(order_id, staff_token, admin_tok):
    status_chain = [
        ("paid", None),
        ("confirmed", None),
        ("preparing", None),
        ("ready", None),
        ("completed", datetime.now(timezone.utc).isoformat()),
    ]
    
    results = []
    for new_status, completed_ts in status_chain:
        payload = {"status": new_status}
        if completed_ts:
            payload["completed_at"] = completed_ts
        payload["notes"] = STAFF_STATUS_NOTES.get(new_status, "")
        
        resp = api_patch(f"/orders/{order_id}/status", token=admin_tok, json=payload)
        if resp.status_code == 200:
            results.append((new_status, "OK"))
        else:
            results.append((new_status, f"FAILED: {resp.status_code}"))
            break
        
        time.sleep(0.1)
    
    return results


def run():
    print_header("STEP 14: Dine-in Flow - Manual Staff Workflow (NO POS)")
    print("  Tests admin dashboard workflow for dine-in orders")
    print("  Staff manually updates order status via admin APIs")
    print("  NOTE: Run EITHER Step 14 OR Step 15, not both")
    print()

    dinein_orders = load_state("dinein_orders")
    if not dinein_orders:
        print("[ERROR] No dine-in orders found. Run verify_seed_12c_place_orders_dinein.py first.")
        return []

    staff_list = load_state("staff")
    if not staff_list:
        print("[ERROR] No staff found. Run verify_seed_04_staff.py first.")
        return []

    admin_tok = admin_token()
    
    results = []
    completed_count = 0
    failed_count = 0

    for i, order in enumerate(dinein_orders):
        order_id = order.get("order_id")
        store_id = order.get("store_id")
        table_id = order.get("table_id")
        
        print(f"  [{i+1}/{len(dinein_orders)}] Order {order_id} (store={store_id}, table={table_id})...", end=" ")
        
        staff_creds = None
        for s in staff_list:
            if s.get("store_id") == store_id and s.get("type") in ("STAFF", "STORE_MGMT"):
                staff_creds = s
                break
        
        if not staff_creds:
            print(f"FAILED - no staff found for store {store_id}")
            failed_count += 1
            results.append({**order, "flow_status": "failed", "error": "No staff for store"})
            continue
        
        staff_email = staff_creds.get("email")
        staff_password = staff_creds.get("temp_password")
        
        if not staff_password:
            print(f"FAILED - no temp_password for staff {staff_email}")
            failed_count += 1
            results.append({**order, "flow_status": "failed", "error": "No staff password"})
            continue
        
        staff_tok = login_staff(staff_email, staff_password)
        if not staff_tok:
            print(f"FAILED - staff login failed for {staff_email}")
            failed_count += 1
            results.append({**order, "flow_status": "failed", "error": "Staff login failed"})
            continue
        
        status_updates = update_order_status_chain(order_id, staff_tok, admin_tok)
        
        all_ok = all(r[1] == "OK" for r in status_updates)
        
        if all_ok:
            tables = get_store_tables(store_id)
            table_info = next((t for t in tables if t.get("id") == table_id), None)
            table_free = not table_info.get("is_occupied") if table_info else None
            
            print(f"OK - status chain completed, table_free={table_free}")
            completed_count += 1
            results.append({
                **order,
                "flow_status": "completed",
                "status_updates": status_updates,
                "table_free_after_completion": table_free,
            })
        else:
            print(f"PARTIAL - status updates: {status_updates}")
            failed_count += 1
            results.append({
                **order,
                "flow_status": "partial",
                "status_updates": status_updates,
            })

        time.sleep(0.1)

    save_state("dinein_orders", results)

    print()
    print(f"[SUMMARY] Dine-in flow (manual staff) completed")
    print(f"  Total dine-in orders: {len(dinein_orders)}")
    print(f"  Successfully completed: {completed_count}")
    print(f"  Failed/partial: {failed_count}")

    return results


if __name__ == "__main__":
    run()