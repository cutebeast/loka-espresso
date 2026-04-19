"""
MASTER ORCHESTRATOR: verify_master_base_seed.py
Purpose: Run all base seed steps (00-08) in sequence with optional --skip-reset flag.
Status: CERTIFIED-2026-04-16
Usage:
  python3 verify_master_base_seed.py          # Full run: reset + seed everything
  python3 verify_master_base_seed.py --skip-reset  # Re-run seed without wiping DB
"""

import sys, os, argparse

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import print_header


STEPS = [
    ("verify_seed_00_full_reset.py", "Full system reset (DB wipe, preserve ACL)"),
    ("verify_seed_01_stores.py",     "Create HQ store + 5 physical stores with tables"),
    ("verify_seed_02_menu.py",       "Create 10 universal menu categories + 35 items"),
    ("verify_seed_03_inventory.py",  "Create per-store inventory (10 cats × ~63 items × 5 stores)"),
    ("verify_seed_04_staff.py",      "Create 21 staff users (3 HQ + 7 store mgmt + 11 staff)"),
    ("verify_seed_05_config.py",     "Create 4 loyalty tiers + 10 system config keys"),
    ("verify_seed_06_rewards.py",    "Create 8 loyalty rewards (6 active, 2 inactive)"),
    ("verify_seed_07_vouchers.py",   "Create 5 checkout vouchers (3 active, 2 expired)"),
    ("verify_seed_08_promotions.py", "Create 3 surveys + 5 promo banners"),
]


def run_step(filename, description, skip_reset=False):
    print(f"\n{'='*60}")
    print(f"  {description}")
    print(f"{'='*60}")
    if skip_reset and "00" in filename:
        print("  [SKIPPED — --skip-reset flag]")
        return True
    rc = os.system(f'cd {SEED_DIR} && python3 {filename}')
    if rc != 0:
        print(f"\n  [✗ FAILED] {filename}")
        return False
    print(f"\n  [✓ PASSED] {filename}")
    return True


def main():
    parser = argparse.ArgumentParser(description="FNB Base Seed Orchestrator")
    parser.add_argument("--skip-reset", action="store_true",
                        help="Skip verify_seed_00_full_reset.py (use existing DB state)")
    args = parser.parse_args()

    print_header("FNB SUPER-APP — BASE SEED ORCHESTRATION")
    print(f"\nRunning {len(STEPS)} seed steps...")
    if args.skip_reset:
        print("  [NOTE] --skip-reset active: verify_seed_00 will be skipped")
    print()

    results = []
    for i, (filename, description) in enumerate(STEPS, 1):
        step_num = filename.split("_")[1]
        ok = run_step(filename,
                      f"STEP {step_num}: {description}",
                      skip_reset=args.skip_reset and i == 1)
        results.append((filename, ok))
        if not ok:
            print(f"\n[!] Orchestration stopped at step {i} ({filename})")
            break

    print(f"\n{'='*60}")
    print("  FINAL SUMMARY")
    print(f"{'='*60}")
    passed = sum(1 for _, ok in results if ok)
    failed = sum(1 for _, ok in results if not ok)
    for filename, ok in results:
        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {status}  {filename}")
    print(f"\n  Total: {passed} passed, {failed} failed out of {len(STEPS)} steps")
    if failed > 0:
        print("\n[FAILED] Base seed incomplete")
        sys.exit(1)
    else:
        print("\n[SUCCESS] All base seed steps completed successfully!")


if __name__ == "__main__":
    main()
