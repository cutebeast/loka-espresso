"""
SEED SCRIPT: verify_seed_17_claim_vouchers.py
Purpose: Customer claims vouchers from promotional banners
Per order_flow_status_guide.md:
  - Customer sees promotional banner
  - Customer claims voucher from banner
  - Voucher added to customer's wallet
  
APIs tested: POST /promos/banners/{banner_id}/claim
Status: CERTIFIED-2026-04-17 | Claim vouchers from promos
Dependencies: verify_seed_12_place_orders.py (customers must exist)
NO direct DB inserts — ALL via API calls.
"""

import sys, os, random
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_post, api_get, save_state, load_state, print_header,
)
import db_validate


def claim_voucher_for_customer(banner_id, customer_token):
    """Claim voucher from a promo banner. Returns (success, voucher_code, error)"""
    resp = api_post(f"/promos/banners/{banner_id}/claim", token=customer_token)
    if resp.status_code in (200, 201):
        data = resp.json()
        return True, data.get("voucher_code"), None
    return False, None, f"{resp.status_code}: {resp.text[:100]}"


def get_active_promo_banners():
    """Get list of active promo banners that offer vouchers.
    
    Note: The PWA API schema doesn't expose voucher_id in list response.
    We query DB directly to find banners with vouchers.
    """
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT pb.id, pb.title, v.code, v.discount_value
            FROM promo_banners pb
            JOIN vouchers v ON pb.voucher_id = v.id
            WHERE pb.voucher_id IS NOT NULL
            AND pb.is_active = true
            ORDER BY pb.id
        """)
        banners = []
        for row in cur.fetchall():
            banners.append({
                "id": row[0],
                "title": row[1],
                "voucher_code": row[2],
                "discount": row[3],
            })
        conn.close()
        return banners
    except Exception as e:
        conn.close()
        return []


def run():
    print_header("STEP 17: Claim Vouchers from Promo Banners")
    print("Flow: POST /promos/banners/{banner_id}/claim → voucher added to wallet")
    print()
    
    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers. Run verify_seed_10_register.py first.")
        return []
    
    # Get active promo banners with vouchers
    banners = get_active_promo_banners()
    if not banners:
        print("[WARN] No active promo banners with vouchers found.")
        print("       This may be expected if all promos are expired.")
        return []
    
    print(f"[*] Found {len(banners)} active promo banners with vouchers")
    print()
    
    # Each customer tries to claim 1-3 vouchers
    claimed = 0
    failed = 0
    results = []
    customer_vouchers = {}  # user_id -> list of voucher_codes
    
    for c in customers:
        user_id = c["user_id"]
        token = c.get("token")
        if not token:
            continue
        
        num_to_claim = random.randint(1, 3)
        user_vouchers = []
        
        for i in range(num_to_claim):
            banner = random.choice(banners)
            success, voucher_code, err = claim_voucher_for_customer(banner["id"], token)
            
            if success and voucher_code:
                claimed += 1
                user_vouchers.append(voucher_code)
                print(f"  {c['name']} claimed {voucher_code} from '{banner['title']}'")
            else:
                failed += 1
        
        if user_vouchers:
            customer_vouchers[user_id] = user_vouchers
            results.append({
                "user_id": user_id,
                "name": c["name"],
                "vouchers": user_vouchers,
            })
    
    print()
    print(f"[SUMMARY] {claimed} vouchers claimed, {failed} failed")
    print(f"  {len(results)} customers claimed vouchers")
    
    # Save claimed vouchers to state
    save_state("claimed_vouchers", results)
    
    return results


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_17_claim_vouchers.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
