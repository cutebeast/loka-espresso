"""
Helper to re-authenticate all customers and save tokens.
"""
import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import load_state, save_state, print_header, re_auth_customer

def run():
    print_header("RE-AUTHENTICATE ALL CUSTOMERS")
    
    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers in state")
        return
    
    print(f"[*] Re-authenticating {len(customers)} customers...")
    
    updated = []
    for i, c in enumerate(customers):
        print(f"  [{i+1}/{len(customers)}] {c.get('name', 'Unknown')}...", end=" ", flush=True)
        updated_customer, new_token = re_auth_customer(c)
        if new_token:
            print(f"✓ token refreshed")
            updated.append(updated_customer)
        else:
            print(f"✗ failed")
            updated.append(c)
    
    save_state("customers", updated)
    print(f"\n[SUCCESS] {len(updated)} customers updated")

if __name__ == "__main__":
    run()
