"""
SEED SCRIPT: verify_seed_12_place_orders_main.py
Purpose: Orchestrator that randomly places orders for customers (pickup/delivery/dine-in)
APIs tested: Calls 12a, 12b, 12c scripts based on random selection
Status: PENDING VERIFICATION
Dependencies: verify_seed_10_register.py, verify_seed_11_wallet_topup.py
              verify_seed_12a_place_orders_pickup.py
              verify_seed_12b_place_orders_delivery.py
              verify_seed_12c_place_orders_dinein.py
Flow:
  1. Load customers from seed_state.json
  2. For each customer (or specified count):
     a. Randomly select order type: pickup (40%), delivery (35%), dine-in (25%)
     b. Call the appropriate script (12a, 12b, or 12c)
     c. Collect results
  3. Print summary
Usage:
  python3 verify_seed_12_place_orders_main.py          # Place 1 order per customer (10 customers)
  python3 verify_seed_12_place_orders_main.py 5        # Place 1 order per customer (5 customers)
  python3 verify_seed_12_place_orders_main.py 3 2      # Place 2 orders each for 3 customers
NO direct DB inserts — ALL via API calls.
"""

import sys
import os
import json
import random
import subprocess
from datetime import datetime, timezone

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
SEED_STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

# Order type weights (pickup=40%, delivery=35%, dine-in=25%)
ORDER_TYPE_WEIGHTS = {
    "pickup": 40,
    "delivery": 35,
    "dine_in": 25,
}

# Scripts for each order type
ORDER_SCRIPTS = {
    "pickup": "verify_seed_12a_place_orders_pickup.py",
    "delivery": "verify_seed_12b_place_orders_delivery.py",
    "dine_in": "verify_seed_12c_place_orders_dinein.py",
}

# Display names
ORDER_TYPE_NAMES = {
    "pickup": "PICKUP",
    "delivery": "DELIVERY",
    "dine_in": "DINE-IN",
}


def load_state():
    """Load seed state from JSON file."""
    if not os.path.exists(SEED_STATE_FILE):
        return None
    try:
        with open(SEED_STATE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return None


def save_state(state):
    """Save seed state to JSON file."""
    with open(SEED_STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_customers():
    """Get customers from seed state."""
    state = load_state()
    if not state:
        return []
    return state.get("customers", [])


def pick_order_type():
    """Randomly select order type based on weights."""
    types = list(ORDER_TYPE_WEIGHTS.keys())
    weights = list(ORDER_TYPE_WEIGHTS.values())
    return random.choices(types, weights=weights, k=1)[0]


def run_order_script(order_type, customer):
    """
    Run the appropriate order script for a customer.
    
    Args:
        order_type: 'pickup', 'delivery', or 'dine_in'
        customer: dict with customer data
    
    Returns:
        dict with order result
    """
    script = ORDER_SCRIPTS[order_type]
    script_path = os.path.join(SEED_DIR, script)
    
    if not os.path.exists(script_path):
        return {"success": False, "error": f"Script not found: {script}"}
    
    # Pass customer data as JSON via stdin
    customer_json = json.dumps(customer)
    
    try:
        result = subprocess.run(
            ["python3", script_path],
            input=customer_json,
            capture_output=True,
            text=True,
            timeout=60,
        )
        
        # Parse result from stdout
        output = result.stdout
        
        # Find JSON result in output (after "--- RESULT ---")
        if "--- RESULT ---" in output:
            json_part = output.split("--- RESULT ---")[1].strip()
            try:
                return json.loads(json_part)
            except json.JSONDecodeError:
                pass
        
        if result.returncode == 0:
            return {"success": True, "output": output}
        else:
            return {"success": False, "error": result.stderr[:200] if result.stderr else "Unknown error"}
    
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Script timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def run():
    """Main function."""
    print()
    print("=" * 60)
    print("  STEP 12: Place Orders (Random Type per Customer)")
    print("=" * 60)
    print()
    
    # Parse arguments
    num_customers = 10  # Default: all 10 customers
    orders_per_customer = 1  # Default: 1 order per customer
    
    if len(sys.argv) > 1:
        try:
            num_customers = int(sys.argv[1])
        except ValueError:
            pass
    
    if len(sys.argv) > 2:
        try:
            orders_per_customer = int(sys.argv[2])
        except ValueError:
            pass
    
    # Load customers
    customers = get_customers()
    if not customers:
        print("[ERROR] No customers found. Run verify_seed_10_register.py first.")
        sys.exit(1)
    
    # Limit to requested number
    customers = customers[:num_customers]
    
    print(f"Customers: {len(customers)}")
    print(f"Orders per customer: {orders_per_customer}")
    print(f"Order types: Pickup ({ORDER_TYPE_WEIGHTS['pickup']}%), "
          f"Delivery ({ORDER_TYPE_WEIGHTS['delivery']}%), "
          f"Dine-in ({ORDER_TYPE_WEIGHTS['dine_in']}%)")
    print()
    
    # Results tracking
    results = {
        "pickup": {"success": 0, "failed": 0, "orders": []},
        "delivery": {"success": 0, "failed": 0, "orders": []},
        "dine_in": {"success": 0, "failed": 0, "orders": []},
    }
    total_orders = 0
    total_subtotal = 0
    
    # Place orders
    for i, customer in enumerate(customers):
        print(f"[{i+1}/{len(customers)}] {customer.get('name', 'Unknown')}:")
        
        for j in range(orders_per_customer):
            # Pick order type
            order_type = pick_order_type()
            
            # Run appropriate script
            result = run_order_script(order_type, customer)
            
            if result.get("success"):
                results[order_type]["success"] += 1
                results[order_type]["orders"].append(result)
                total_orders += 1
                subtotal = result.get("subtotal", 0)
                total_subtotal += subtotal
                print(f"    ✓ {ORDER_TYPE_NAMES[order_type]} - Order #{result.get('order_number', '?')}: RM {subtotal:.2f}")
            else:
                results[order_type]["failed"] += 1
                print(f"    ✗ {ORDER_TYPE_NAMES[order_type]} - {result.get('error', 'Unknown')[:50]}")
        
        print()
    
    # Summary
    print("=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    print()
    
    for order_type in ["pickup", "delivery", "dine_in"]:
        success = results[order_type]["success"]
        failed = results[order_type]["failed"]
        total = success + failed
        type_total = sum(r.get("subtotal", 0) for r in results[order_type]["orders"])
        print(f"  {ORDER_TYPE_NAMES[order_type]}: {success}/{total} successful (RM {type_total:.2f})")
    
    print()
    print(f"  Total Orders: {total_orders}")
    print(f"  Total Revenue: RM {total_subtotal:.2f}")
    print()


if __name__ == "__main__":
    run()
