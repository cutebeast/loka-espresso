"""
MASTER ORCHESTRATOR: verify_master_customer_seed.py
Purpose: Run all customer seed steps (09-16) in sequence with optional --skip-reset flag.
Status: CERTIFIED-2026-04-16
Usage:
  python3 verify_master_customer_seed.py          # Full run: reset + seed everything
  python3 verify_master_customer_seed.py --skip-reset  # Re-run seed without wiping customers
"""

import sys, os, argparse, time

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import print_header, load_state, save_state, admin_token, api_get


STEPS = [
    ("verify_seed_09_reset_customers.py", "Reset customer data (DB + state file)"),
    ("verify_seed_10_register.py",        "Register customers via OTP (50 default)"),
    ("verify_seed_11_wallet_topup.py",    "Top up wallets (RM 200 per customer)"),
    ("verify_seed_12_place_orders.py",    "Place orders (40% pickup, 35% delivery, 25% dine_in)"),
    ("verify_seed_19_delivery_flow.py",   "Simulate delivery lifecycle via mock API"),
    ("verify_seed_20_dinein_flow.py",     "Verify dine-in table occupancy workflow"),
]


def run_step(filename, description, skip_reset=False):
    print(f"\n{'='*60}")
    print(f"  {description}")
    print(f"{'='*60}")
    if skip_reset and "09" in filename:
        print("  [SKIPPED — --skip-reset flag]")
        return True
    rc = os.system(f'cd {SEED_DIR} && python3 {filename}')
    if rc != 0:
        print(f"\n  [✗ FAILED] {filename}")
        return False
    print(f"\n  [✓ PASSED] {filename}")
    return True


def run_summary():
    """Print final summary of all seeded customer data."""
    print_header("FINAL CUSTOMER SEED SUMMARY")

    customers = load_state("customers")
    if not customers:
        print("No customer data found.")
        return

    print(f"\n  Total customers: {len(customers)}")

    tok = admin_token()
    try:
        resp = api_get("/admin/customers?sort_by=points_balance&sort_dir=desc&page_size=100", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            all_customers = data.get("customers", []) if isinstance(data, dict) else data
            bronze = sum(1 for c in all_customers if c.get("tier") == "bronze")
            silver = sum(1 for c in all_customers if c.get("tier") == "silver")
            gold   = sum(1 for c in all_customers if c.get("tier") == "gold")
            plat   = sum(1 for c in all_customers if c.get("tier") == "platinum")
            print(f"\n  TIER DISTRIBUTION (from API):")
            print(f"    Platinum (>=3000 pts): {plat}")
            print(f"    Gold     (>=1500 pts): {gold}")
            print(f"    Silver   (>=500 pts):  {silver}")
            print(f"    Bronze   (<500 pts):   {bronze}")
            print(f"\n  TOP 10 CUSTOMERS BY POINTS:")
            for c in all_customers[:10]:
                print(f"    {c.get('name', '?'):20s}  pts={c.get('points_balance', 0):5d}  tier={c.get('tier', '?'):10s}")
    except Exception as e:
        print(f"  Could not fetch admin summary: {e}")

    completed = load_state("completed_orders")
    if completed:
        total_pts = sum(int(o.get("points_earned", 0)) for o in completed)
        print(f"\n  Completed orders: {len(completed)}")
        print(f"  Total loyalty points awarded: {total_pts}")


def main():
    parser = argparse.ArgumentParser(description="FNB Customer Seed Orchestrator")
    parser.add_argument("--skip-reset", action="store_true",
                        help="Skip verify_seed_09_reset_customers.py (use existing customer state)")
    args = parser.parse_args()

    print_header("FNB SUPER-APP — CUSTOMER SEED ORCHESTRATION")
    print(f"\nRunning {len(STEPS)} customer seed steps (09-16)...")
    if args.skip_reset:
        print("  [NOTE] --skip-reset active: step 09 (reset) will be skipped")
    print()

    results = []
    for i, (filename, description) in enumerate(STEPS, 9):
        ok = run_step(filename,
                      f"STEP {i}: {description}",
                      skip_reset=args.skip_reset and i == 9)
        results.append((filename, ok))
        if not ok:
            print(f"\n[!] Orchestration stopped at step {i} ({filename})")
            break
        time.sleep(1)

    print(f"\n{'='*60}")
    print("  FINAL SUMMARY")
    print(f"{'='*60}")
    passed = sum(1 for _, ok in results if ok)
    failed = sum(1 for _, ok in results if not ok)
    for filename, ok in results:
        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {status}  {filename}")
    print(f"\n  Total: {passed} passed, {failed} failed out of {len(STEPS)} steps")

    if passed == len(STEPS):
        run_summary()
        print("\n[SUCCESS] All customer seed steps completed successfully!")
    else:
        print("\n[FAILED] Customer seed incomplete")
        sys.exit(1)


if __name__ == "__main__":
    main()