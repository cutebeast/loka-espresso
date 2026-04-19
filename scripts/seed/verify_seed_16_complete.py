"""
SEED SCRIPT: verify_seed_16_complete.py
Purpose: Mark orders as completed
Per order_flow_status_guide.md:
  - For dine-in/pickup: ready → completed (customer picked up / served)
  - For delivery: out_for_delivery → completed (courier delivered)
  
  This is the final step - order is fulfilled and closed.

APIs tested: PATCH /orders/{id}/status
Status: CERTIFIED-2026-04-17 | Complete orders
Dependencies: verify_seed_15_fulfillment.py (ready orders must exist)
NO direct DB inserts — ALL via API calls.
"""

import sys, os, time
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_patch, save_state, load_state, print_header,
    admin_token, invalidate_admin_token,
)
import db_validate


def _order_completed(order_id):
    """DB check: is order already completed?"""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT status FROM orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        conn.close()
        return row and row[0] == "completed"
    except Exception:
        conn.close()
        return False


def complete_order(order_id):
    """
    Mark order as completed.
    
    Returns: dict with {success, error}
    """
    result = {
        "success": False,
        "error": None,
    }
    
    admin_tok = admin_token()
    
    status_resp = api_patch(f"/orders/{order_id}/status", token=admin_tok,
                           json={"status": "completed"})
    if status_resp.status_code == 401:
        invalidate_admin_token()
        admin_tok = admin_token()
        status_resp = api_patch(f"/orders/{order_id}/status", token=admin_tok,
                               json={"status": "completed"})
    if status_resp.status_code not in (200, 201):
        result["error"] = f"completed failed: {status_resp.status_code}"
        return result
    
    result["success"] = True
    return result


def run():
    print_header("STEP 16: Complete Orders")
    print("Flow: PATCH /orders/{id}/status (status=completed)")
    print("  → Final step - order fulfilled and closed")
    print()
    
    ready_orders = load_state("ready_orders")
    
    if not ready_orders:
        print("[ERROR] No ready orders. Run verify_seed_15_fulfillment.py first.")
        return []
    
    print(f"[*] Processing {len(ready_orders)} ready orders...")
    print()
    
    completed = 0
    skipped = 0
    failed = 0
    results = []
    
    for i, item in enumerate(ready_orders):
        order_id = item["order_id"]
        
        # Idempotency: already completed?
        if _order_completed(order_id):
            skipped += 1
            results.append({**item, "status": "skipped"})
            print(f"  [{i+1}/{len(ready_orders)}] Order #{order_id} — SKIPPED (already completed)")
            continue
        
        res = complete_order(order_id)
        
        if res["success"]:
            completed += 1
            results.append({**item, "status": "completed"})
            print(f"  [{i+1}/{len(ready_orders)}] Order #{order_id} — COMPLETED")
        else:
            failed += 1
            results.append({**item, "status": "failed", "error": res["error"]})
            print(f"  [{i+1}/{len(ready_orders)}] Order #{order_id} — FAILED: {res['error']}")
        
        time.sleep(0.05)
    
    save_state("completed_orders", results)
    
    print()
    print(f"[SUMMARY] {completed}/{len(ready_orders)} completed, {skipped} skipped, {failed} failed")
    
    return results


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_16_complete.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
