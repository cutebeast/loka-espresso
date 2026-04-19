"""
SEED SCRIPT: verify_seed_13_order_completion.py
Purpose: Main orchestrator for order completion - routes orders to Flow A or Flow B
APIs tested:
  - GET /orders (fetch pending orders)
  - Delegates to verify_seed_13a_flow_pickup_delivery.py (Flow A)
  - Delegates to verify_seed_13b_flow_dinein.py (Flow B)
Status: CERTIFIED-2026-04-19 | Order completion orchestrator - routes to Flow A or B
Dependencies: verify_seed_12a_place_orders_pickup.py, verify_seed_12b_place_orders_delivery.py, verify_seed_12c_place_orders_dinein.py
Flow:
  1. Fetch all pending orders via API
  2. Route orders by type:
     - pickup, delivery → Flow A (13a): Checkout → Pay → Fulfill → Complete
     - dine_in → Flow B (13b): Confirm → Fulfill → Pay → Complete
  3. Track and report results
Usage:
  python3 verify_seed_13_order_completion.py
  This is the MAIN entry point for order completion.
NO direct DB access — ALL via API calls.
"""

import sys
import os
import json
import time

# Add parent directory to path for shared_config
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    API_BASE, admin_token, api_get,
    save_state, load_state, print_header
)

# Import the flow modules
import verify_seed_13a_flow_pickup_delivery as flow_a
import verify_seed_13b_flow_dinein as flow_b


def get_pending_orders(token):
    """Get all pending orders from API."""
    try:
        params = {"page": 1, "page_size": 100}
        resp = api_get("/orders", token=token, params=params)
        if resp.status_code != 200:
            return None, f"GET /orders failed: {resp.status_code}"

        data = resp.json()
        orders = data.get("orders", [])

        # Filter for pending orders only
        pending = [o for o in orders if o.get("status") == "pending"]

        return pending, None
    except Exception as e:
        return None, str(e)


def categorize_orders(orders):
    """Separate orders into Flow A (pickup/delivery) and Flow B (dine-in)."""
    flow_a_orders = [o for o in orders if o.get("order_type") in ("pickup", "delivery")]
    flow_b_orders = [o for o in orders if o.get("order_type") == "dine_in"]
    return flow_a_orders, flow_b_orders


def run():
    """Main orchestrator function."""
    print_header("STEP 13: Order Completion Orchestrator")
    print("  Routes orders to appropriate flow based on order type:")
    print("    Flow A (Pickup/Delivery): Checkout → Pay → Fulfill → Complete")
    print("    Flow B (Dine-in): Confirm → Fulfill → Pay → Complete")
    print()

    # Get admin token for order operations
    print("Authenticating as admin...")
    tok = admin_token()
    if not tok:
        print("✗ Failed to get admin token")
        sys.exit(1)
    print("✓ Admin authenticated")

    # Get pending orders
    print("\nFetching pending orders...")
    orders, err = get_pending_orders(tok)
    if err:
        print(f"✗ Failed to fetch orders: {err}")
        sys.exit(1)

    if not orders:
        print("No pending orders found.")
        print("Run verify_seed_12a_place_orders_pickup.py,")
        print("    verify_seed_12b_place_orders_delivery.py,")
        print("    verify_seed_12c_place_orders_dinein.py first.")
        sys.exit(0)

    print(f"Found {len(orders)} pending orders to process")

    # Categorize orders
    flow_a_orders, flow_b_orders = categorize_orders(orders)

    print(f"  Flow A (Pickup/Delivery): {len(flow_a_orders)} orders")
    print(f"  Flow B (Dine-in): {len(flow_b_orders)} orders")
    print()

    # Track results
    all_results = {
        "flow_a": {"processed": 0, "successful": 0, "failed": 0, "orders": []},
        "flow_b": {"processed": 0, "successful": 0, "failed": 0, "orders": []},
    }

    # Process Flow A orders
    if flow_a_orders:
        print(f"{'='*60}")
        print("  PROCESSING FLOW A (Pickup & Delivery)")
        print(f"{'='*60}")

        for i, order in enumerate(flow_a_orders, 1):
            print(f"\n  [{i}/{len(flow_a_orders)}] Processing {order.get('order_type')} order...")

            success, result = flow_a.process_flow_a_order(order, tok)

            all_results["flow_a"]["processed"] += 1
            if success:
                all_results["flow_a"]["successful"] += 1
                all_results["flow_a"]["orders"].append(result)
                print(f"    ✓ Success: Order #{result.get('order_number')}")
            else:
                all_results["flow_a"]["failed"] += 1
                all_results["flow_a"]["orders"].append({"order_id": order.get("id"), "error": result})
                print(f"    ✗ Failed: {result}")

            if i < len(flow_a_orders):
                time.sleep(0.3)

    # Process Flow B orders
    if flow_b_orders:
        print(f"\n{'='*60}")
        print("  PROCESSING FLOW B (Dine-in)")
        print(f"{'='*60}")

        for i, order in enumerate(flow_b_orders, 1):
            print(f"\n  [{i}/{len(flow_b_orders)}] Processing dine-in order...")

            success, result = flow_b.process_flow_b_order(order, tok)

            all_results["flow_b"]["processed"] += 1
            if success:
                all_results["flow_b"]["successful"] += 1
                all_results["flow_b"]["orders"].append(result)
                print(f"    ✓ Success: Order #{result.get('order_number')}")
            else:
                all_results["flow_b"]["failed"] += 1
                all_results["flow_b"]["orders"].append({"order_id": order.get("id"), "error": result})
                print(f"    ✗ Failed: {result}")

            if i < len(flow_b_orders):
                time.sleep(0.3)

    # Summary
    print(f"\n{'='*60}")
    print("  FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"  Total orders processed: {len(orders)}")
    print()
    print(f"  Flow A (Pickup/Delivery):")
    print(f"    Processed: {all_results['flow_a']['processed']}")
    print(f"    Successful: {all_results['flow_a']['successful']}")
    print(f"    Failed: {all_results['flow_a']['failed']}")
    print()
    print(f"  Flow B (Dine-in):")
    print(f"    Processed: {all_results['flow_b']['processed']}")
    print(f"    Successful: {all_results['flow_b']['successful']}")
    print(f"    Failed: {all_results['flow_b']['failed']}")

    # Save results
    save_state("order_completion_results", all_results)
    print(f"\n  Results saved to seed_state.json")

    # Exit with appropriate code
    total_failed = all_results["flow_a"]["failed"] + all_results["flow_b"]["failed"]
    if total_failed > 0:
        print(f"\n  ⚠ {total_failed} orders failed to process")
        sys.exit(1)

    print("\n  ✓ All orders completed successfully!")
    sys.exit(0)


if __name__ == "__main__":
    run()
