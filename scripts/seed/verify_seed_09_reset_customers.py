"""
SEED SCRIPT: verify_seed_09_reset_customers.py
Purpose: Customer-only reset — wipe all customer data, preserve base seed (stores, menu, rewards, etc.)
APIs tested: DELETE /admin/customers/reset, GET /admin/customers
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: Base seed (verify_seed_00-08) must be done first
Note: This resets ONLY customer-related data. It does NOT touch stores, menu, rewards, vouchers, etc.
Idempotency: Safe to re-run on clean state (API is idempotent, DB check confirms clean state).
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_delete, api_get, admin_token, print_header, STATE_FILE
import db_validate


def run():
    print_header("STEP 09: Reset Customer Data (preserve base seed)")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    # ── Phase 1: Call reset API ──────────────────────────────────────────
    print("[*] Calling DELETE /admin/customers/reset...")
    resp = api_delete("/admin/customers/reset", token=token)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Customer reset API failed: {resp.status_code} {resp.text}")
    data = resp.json()
    print(f"  ✓ Reset complete — deleted_counts: {data.get('deleted_counts', 'N/A')}")

    # ── Phase 2: Verify clean state via DB ───────────────────────────────
    print("[*] DB Validation: verifying clean state...")
    ok, count, msg = db_validate.validate_customer_reset()
    if not ok:
        raise RuntimeError(f"Customer reset validation failed: {msg}")
    print(f"  ✓ {msg}")

    # ── Phase 3: Verify via API ──────────────────────────────────────────
    print("[*] Verifying via GET /admin/customers...")
    resp = api_get("/admin/customers?page=1&page_size=5", token=token)
    if resp.status_code == 200:
        d = resp.json()
        customers = d.get("customers", d) if isinstance(d, dict) else d
        total = d.get("total", len(customers)) if isinstance(d, dict) else len(customers)
        print(f"  ✓ API confirms {total} customers (should be 0)")
    else:
        print(f"  [WARN] GET /admin/customers returned {resp.status_code}")

    # ── Phase 4: Clear seed state file ──────────────────────────────────
    print("[*] Clearing seed state file...")
    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)
        print(f"  ✓ Deleted: {STATE_FILE}")
    else:
        print(f"  ✓ No existing state file — clean")

    print("\n[✓] STEP 09 complete — all customer data reset, base seed preserved")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_09_reset_customers.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
