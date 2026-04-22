"""
SEED SCRIPT: verify_seed_17_complete_discounted_orders.py
Purpose: Complete the discounted orders placed in step 16.
"""
import os
import sys
import time

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import admin_token, api_patch, api_post, load_state

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
        customer_token = o.get("token")
        print(f"Processing Order #{order_number} (Discount: {discount_used})")
        
        # 1. Pay through the current wallet-payment contract
        if not customer_token:
            print("  ✗ Missing customer token for discounted order")
            failed_count += 1
            continue

        intent_resp = api_post("/payments/create-intent", token=customer_token, json={"order_id": order_id, "method": "wallet"})
        if intent_resp.status_code not in (200, 201):
            print(f"  ✗ Failed to create payment intent: {intent_resp.text}")
            failed_count += 1
            continue
        payment_id = intent_resp.json().get("payment_id")
        resp = api_post("/payments/confirm", token=customer_token, json={"payment_id": payment_id})
        if resp.status_code not in (200, 201):
            print(f"  ✗ Failed to confirm payment: {resp.text}")
            failed_count += 1
            continue
             
        print("  ✓ Payment successful (Status: paid)")
        
        # 2. Lifecycle — payment confirm auto-sets pickup/delivery to 'confirmed'
        statuses = ["preparing", "ready", "completed"]
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
