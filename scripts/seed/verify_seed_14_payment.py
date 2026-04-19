"""
SEED SCRIPT: verify_seed_14_payment.py
Purpose: Process payment for pending orders
Per order_flow_status_guide.md:
  1. POST /payments/create-intent → creates payment intent
  2. POST /payments/confirm → payment confirmed, LOYALTY POINTS AWARDED HERE
  
  Note: If wallet has insufficient funds, call wallet topup API first,
        then retry payment.
  
APIs tested: POST /payments/create-intent, POST /payments/confirm, POST /wallet/topup
Status: CERTIFIED-2026-04-17 | Payment flow with auto topup
Dependencies: verify_seed_12_place_orders.py (pending orders must exist)
NO direct DB inserts — ALL via API calls.
"""

import sys, os, time, random
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_post, save_state, load_state, print_header,
)
import db_validate


def _order_paid(order_id):
    """DB check: is payment already done?"""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT payment_status FROM orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        conn.close()
        return row and row[0] == "paid"
    except Exception:
        conn.close()
        return False


def _get_order_total(order_id):
    """Get order total amount (subtotal - discount + delivery_fee)"""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT subtotal - discount + delivery_fee as total
            FROM orders WHERE id = %s
        """, (order_id,))
        row = cur.fetchone()
        conn.close()
        return float(row[0]) if row else 0
    except Exception:
        conn.close()
        return 0


def _get_wallet_balance(user_id):
    """Get customer's wallet balance"""
    conn = db_validate.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT balance FROM wallets WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        return float(row[0]) if row else 0
    except Exception:
        conn.close()
        return 0


def wallet_topup(customer_token, amount):
    """Call wallet topup API. Returns (success, error_msg)"""
    resp = api_post("/wallet/topup", token=customer_token, json={
        "amount": amount,
        "provider": "seed_test",
        "transaction_id": f"TOPUP-{random.randint(100000, 999999)}"
    })
    if resp.status_code in (200, 201):
        return True, None
    return False, f"topup failed: {resp.status_code} - {resp.text[:100]}"


def process_payment(order_id, customer_token, user_id):
    """
    Process payment for one order.
    If insufficient wallet funds, auto topup and retry.
    
    Returns: dict with {success, points_earned, error, topped_up}
    """
    result = {
        "success": False,
        "points_earned": 0,
        "error": None,
        "topped_up": False,
    }
    
    # Check wallet balance vs order total
    order_total = _get_order_total(order_id)
    wallet_balance = _get_wallet_balance(user_id)
    
    if wallet_balance < order_total:
        # Need to top up - calculate required amount (add RM 50 buffer)
        topup_amount = order_total - wallet_balance + 50
        success, err = wallet_topup(customer_token, topup_amount)
        if not success:
            result["error"] = f"topup failed: {err}"
            return result
        result["topped_up"] = True
    
    # Step 1: Create payment intent
    intent_resp = api_post("/payments/create-intent", token=customer_token,
                          json={"order_id": order_id, "method": "wallet"})
    if intent_resp.status_code not in (200, 201):
        result["error"] = f"create-intent failed: {intent_resp.status_code}"
        return result
    
    payment_id = intent_resp.json().get("payment_id")
    if not payment_id:
        result["error"] = "No payment_id in response"
        return result
    
    # Step 2: Confirm payment — LOYALTY POINTS AWARDED HERE
    confirm_resp = api_post("/payments/confirm", token=customer_token,
                           json={"payment_id": payment_id})
    if confirm_resp.status_code != 200:
        # Check if insufficient funds
        resp_text = confirm_resp.text.lower()
        if "insufficient" in resp_text:
            result["error"] = "insufficient funds even after topup"
        else:
            result["error"] = f"confirm failed: {confirm_resp.status_code}"
        return result
    
    result["points_earned"] = confirm_resp.json().get("points_earned", 0)
    result["success"] = True
    return result


def run():
    print_header("STEP 14: Process Payment for Pending Orders")
    print("Flow: POST /payments/create-intent → POST /payments/confirm")
    print("  → Loyalty points awarded at payment confirmation")
    print()
    
    pending_orders = load_state("pending_orders")
    customers = load_state("customers")
    
    if not pending_orders:
        print("[ERROR] No pending orders. Run verify_seed_12_place_orders.py first.")
        return []
    
    if not customers:
        print("[ERROR] No customers. Run verify_seed_10_register.py first.")
        return []
    
    # Build customer token lookup
    customer_tokens = {c["user_id"]: c.get("token") for c in customers}
    
    print(f"[*] Processing {len(pending_orders)} pending orders...")
    print()
    
    paid = 0
    skipped = 0
    failed = 0
    results = []
    total_points = 0
    
    for i, item in enumerate(pending_orders):
        order_id = item["order_id"]
        user_id = item.get("user_id")
        customer_token = customer_tokens.get(user_id) if user_id else None
        
        # Idempotency: already paid?
        if _order_paid(order_id):
            skipped += 1
            results.append({**item, "status": "skipped"})
            print(f"  [{i+1}/{len(pending_orders)}] Order #{order_id} — SKIPPED (already paid)")
            continue
        
        if not customer_token:
            print(f"  [{i+1}/{len(pending_orders)}] Order #{order_id} — FAILED (no token)")
            failed += 1
            results.append({**item, "status": "failed", "error": "no customer token"})
            continue
        
        res = process_payment(order_id, customer_token, user_id)
        
        topped_note = " (TOPUP)" if res.get("topped_up") else ""
        if res["success"]:
            paid += 1
            total_points += res["points_earned"]
            results.append({**item, "status": "paid", "points_earned": res["points_earned"]})
            print(f"  [{i+1}/{len(pending_orders)}] Order #{order_id} — PAID{topped_note}, +{res['points_earned']} pts")
        else:
            failed += 1
            results.append({**item, "status": "failed", "error": res["error"]})
            print(f"  [{i+1}/{len(pending_orders)}] Order #{order_id} — FAILED: {res['error']}")
        
        time.sleep(0.05)
    
    save_state("paid_orders", results)
    
    print()
    print(f"[SUMMARY] {paid}/{len(pending_orders)} paid, {skipped} skipped, {failed} failed")
    print(f"  Total loyalty points awarded: {total_points}")
    
    return results


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_14_payment.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
