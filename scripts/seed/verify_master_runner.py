#!/usr/bin/env python3
"""Master seed journey runner.

Runs base setup, customer registration, and all three ordering journeys
(pickup, delivery, dine-in) against a local dev API by default.

Usage:
    python3 verify_master_runner.py [--reset] [--customers N] [--orders-per-customer N] [--journey pickup|delivery|dine-in|all]

Environment:
    API_BASE    default: http://localhost:3002/api/v1
    ADMIN_EMAIL default: admin@loyaltysystem.uk
    ADMIN_PASS  default: admin123
"""
import argparse
import os
import subprocess
import sys

API_BASE = os.environ.get("API_BASE", "http://localhost:3002/api/v1")

# Ordered base setup scripts
BASE_SCRIPTS = [
    "verify_seed_01_stores.py",
    "verify_seed_02_menu.py",
    "verify_seed_03_inventory.py",
    "verify_seed_04_staff.py",
    "verify_seed_05_config.py",
    "verify_seed_06_rewards.py",
    "verify_seed_07_vouchers.py",
    "verify_seed_08_promotions.py",
]

# Customer and journey scripts
CUSTOMER_SCRIPTS = [
    "verify_seed_09_reset_customers.py",
    "verify_seed_10_register.py",
]

JOURNEY_SCRIPTS = {
    "pickup": ["verify_seed_12a_place_orders_pickup.py"],
    "delivery": ["verify_seed_12b_place_orders_delivery.py"],
    "dine_in": ["verify_seed_12c_place_orders_dinein.py"],
}

COMPLETION_SCRIPTS = [
    "verify_seed_13_order_completion.py",
]


def run_script(name: str, extra_args: list[str] | None = None) -> bool:
    cmd = [sys.executable, name]
    if extra_args:
        cmd.extend(extra_args)
    print(f"\n>>> Running {name} {' '.join(extra_args or [])}")
    result = subprocess.run(cmd, cwd=os.path.dirname(__file__) or ".")
    if result.returncode != 0:
        print(f"!!! FAILED: {name}")
        return False
    print(f"<<< OK: {name}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Master seed journey runner")
    parser.add_argument("--reset", action="store_true", help="Run full reset first")
    parser.add_argument("--customers", type=int, default=5, help="Number of customers to register")
    parser.add_argument("--orders-per-customer", type=int, default=2, help="Orders per customer")
    parser.add_argument("--journey", choices=["pickup", "delivery", "dine_in", "all"], default="all")
    parser.add_argument("--skip-base", action="store_true", help="Skip base setup scripts")
    parser.add_argument("--dry-run", action="store_true", help="Print what would run without executing")
    args = parser.parse_args()

    print(f"=== Master Seed Runner ===")
    print(f"API_BASE: {API_BASE}")
    print(f"Reset: {args.reset}")
    print(f"Customers: {args.customers}")
    print(f"Journey: {args.journey}")

    if args.dry_run:
        print("\n[DRY RUN - no scripts executed]")
        return

    success = True

    if args.reset:
        success = run_script("verify_seed_00_full_reset.py") and success

    if not args.skip_base:
        for script in BASE_SCRIPTS:
            success = run_script(script) and success

    for script in CUSTOMER_SCRIPTS:
        extra = [str(args.customers)] if script == "verify_seed_10_register.py" else None
        success = run_script(script, extra) and success

    journeys = ["pickup", "delivery", "dine_in"] if args.journey == "all" else [args.journey]
    for j in journeys:
        for script in JOURNEY_SCRIPTS[j]:
            success = run_script(script) and success

    for script in COMPLETION_SCRIPTS:
        success = run_script(script) and success

    if success:
        print("\n=== ALL JOURNEYS COMPLETED SUCCESSFULLY ===")
        sys.exit(0)
    else:
        print("\n=== SOME JOURNEYS FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
