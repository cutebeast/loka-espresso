"""
SEED SCRIPT: verify_seed_13_apply_discount.py
Purpose: Apply voucher/reward discounts to pending orders

NOTE: Per order_flow_status_guide.md, discounts are applied at CHECKOUT (order creation),
not after order is created. The order creation flow is:
  1. Add cart items
  2. Checkout (apply voucher OR reward discount) → Order created WITH discount baked in

This script is for situations where:
  - We have existing pending orders WITHOUT discounts
  - We want to apply discounts to them

Options:
  A) Cancel existing orders and create new ones with discounts (recommended for clean data)
  B) If there's an update order API, update the discount field

Since there's no API to update discount on existing orders, this script:
  - Skips if orders already have discounts
  - Notes that for real discount flow, use verify_seed_12 with voucher/reward codes

APIs used: None (this is informational / data fix script)
Status: CERTIFIED-2026-04-17 | Discounts applied at checkout
Dependencies: verify_seed_12_place_orders.py
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import save_state, load_state, print_header
import db_validate


def check_pending_orders():
    """Check pending orders for discount status."""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*),
                   SUM(CASE WHEN discount > 0 THEN 1 ELSE 0 END) as with_discount,
                   SUM(CASE WHEN discount = 0 THEN 1 ELSE 0 END) as without_discount
            FROM orders
            WHERE user_id IN (SELECT id FROM users WHERE role_id = 6)
              AND status = 'pending'
              AND payment_status = 'pending'
        """)
        row = cur.fetchone()
        conn.close()
        return {
            "total": row[0] or 0,
            "with_discount": row[1] or 0,
            "without_discount": row[2] or 0,
        }
    except Exception as e:
        conn.close()
        return {"error": str(e)}


def run():
    print_header("STEP 13: Apply Discounts (Informational)")
    print("IMPORTANT: Discounts are applied at CHECKOUT (order creation), not after.")
    print()
    
    pending = check_pending_orders()
    
    if "error" in pending:
        print(f"[ERROR] {pending['error']}")
        return []
    
    print(f"Pending orders analysis:")
    print(f"  Total pending: {pending['total']}")
    print(f"  With discount: {pending['with_discount']}")
    print(f"  Without discount: {pending['without_discount']}")
    print()
    
    if pending['without_discount'] > 0:
        print("DISCOUNT FLOW:")
        print("  To apply discounts, use verify_seed_12_place_orders.py with:")
        print("  - Customer has claimed vouchers (see verify_seed_17_claim_vouchers.py)")
        print("  - Customer has redeemed rewards (see verify_seed_18_redeem_rewards.py)")
        print()
        print("  The helper will apply voucher OR reward at checkout (order creation).")
        print()
        print("  To proceed without discounts, run:")
        print("    verify_seed_14_payment.py")
        print("    verify_seed_15_fulfillment.py")
        print("    verify_seed_16_complete.py")
    else:
        print("All pending orders have discounts applied.")
        print("Proceed to verify_seed_14_payment.py")
    
    return []


if __name__ == "__main__":
    run()
    print("\n[INFO] verify_seed_13_apply_discount.py - discounts at checkout")
