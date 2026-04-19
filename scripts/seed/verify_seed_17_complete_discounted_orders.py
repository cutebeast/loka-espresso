"""
SEED SCRIPT: verify_seed_17_complete_discounted_orders.py
Purpose: Complete the discounted orders placed in step 16.
"""
import os
import json
import requests
import time
from shared_config import admin_token, api_patch, api_get

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
SEED_STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

def load_state():
    if not os.path.exists(SEED_STATE_FILE): return None
    with open(SEED_STATE_FILE, "r") as f: return json.load(f)

def run():
    print("\n" + "="*60)
    print("  STEP 17: Complete Discounted Orders")
    print("="*60 + "\n")
    
    state = load_state()
    if not state:
        print("[ERROR] No state found.")
        return
        
    discounted_orders = state.get("discounted_orders", [])
    if not discounted_orders:
        print("No discounted orders found to complete.")
        return
        
    tok = admin_token()
    success_count = 0
    failed_count = 0
    
    for o in discounted_orders:
        order_id = o["order_id"]
        order_number = o["order_number"]
        discount_used = o["discount_used"]
        print(f"Processing Order #{order_number} (Discount: {discount_used})")
        
        # We simulate payment and lifecycle
        # 1. Update payment status to paid (so we can confirm)
        resp = api_patch(f"/orders/{order_id}/payment-status", token=tok, json={"payment_status": "paid"})
        if resp.status_code not in (200, 201):
            print(f"  ✗ Failed to pay: {resp.text}")
            failed_count += 1
            continue
            
        print("  ✓ Payment successful (Status: paid)")
        
        # 2. Lifecycle
        statuses = ["confirmed", "preparing", "ready", "completed"]
        failed = False
        for status in statuses:
            resp = api_patch(f"/orders/{order_id}/status", token=tok, json={"status": status})
            if resp.status_code not in (200, 201):
                print(f"  ✗ Failed to update status to {status}: {resp.text}")
                failed = True
                break
            time.sleep(0.1)
            
        if not failed:
            print("  ✓ Order completed successfully")
            success_count += 1
        else:
            failed_count += 1
            
    print("\n[SUMMARY]")
    print(f"  Total successful: {success_count}")
    print(f"  Total failed: {failed_count}")
    if failed_count == 0 and success_count > 0:
        print("\n[SUCCESS] verify_seed_17_complete_discounted_orders.py")

if __name__ == "__main__":
    run()
