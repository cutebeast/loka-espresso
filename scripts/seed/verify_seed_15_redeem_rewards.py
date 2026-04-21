"""
SEED SCRIPT: verify_seed_15_redeem_rewards.py
Purpose: Customer redeems rewards using loyalty points
APIs tested:
  - GET /rewards (list available rewards catalog)
  - GET /loyalty/balance (get customer loyalty points balance)
  - POST /rewards/{reward_id}/redeem (redeem reward, deducts points)
Status: READY FOR VERIFICATION
Dependencies: verify_seed_10_register.py (customers must exist), verify_seed_13_order_completion.py (customers need loyalty points)
Flow:
  1. Get available rewards from catalog
  2. Get customer loyalty points balance
  3. Filter rewards customer can afford
  4. Redeem rewards (points deducted immediately)
  5. Receive redemption code for use at checkout
  
  Rules:
  - Customer must have sufficient loyalty points
  - Points deducted immediately upon redemption
  - Redemption code generated (can be used at checkout)
  - Stock limits enforced by API
  - One reward per redemption transaction
Usage:
  python3 verify_seed_15_redeem_rewards.py
NO direct DB access — ALL via API calls.
"""

import sys
import os
import random

SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)

from shared_config import (
    api_post, api_get, save_state, load_state, print_header,
)


def get_reward_catalog():
    """Get available rewards from catalog.
    
    Returns list of rewards with id, name, points_cost.
    Stock limits checked by API during redemption.
    """
    try:
        resp = api_get("/rewards")
        if resp.status_code == 200:
            rewards = []
            for r in resp.json():
                rewards.append({
                    "id": r["id"],
                    "name": r["name"],
                    "points_cost": r["points_cost"],
                })
            return rewards
        return []
    except Exception as e:
        print(f"    Error fetching rewards: {e}")
        return []


def get_customer_points(customer_token):
    """Get customer's loyalty points balance."""
    try:
        resp = api_get("/loyalty/balance", token=customer_token)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("points_balance", 0)
        # Fallback: combined wallet endpoint exposes loyalty_points
        resp = api_get("/me/wallet", token=customer_token)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("loyalty_points", 0)
        return 0
    except Exception:
        return 0


def redeem_reward_for_customer(reward_id, customer_token):
    """Redeem a reward. Returns (success, redemption_code, error)"""
    try:
        resp = api_post(f"/rewards/{reward_id}/redeem", token=customer_token)
        if resp.status_code in (200, 201):
            data = resp.json()
            return True, data.get("redemption_code"), None
        return False, None, f"{resp.status_code}: {resp.text[:100]}"
    except Exception as e:
        return False, None, str(e)


def run():
    print_header("STEP 15: Redeem Rewards using Loyalty Points")
    print("Flow: GET /rewards → POST /rewards/{id}/redeem → redemption code")
    print("  → Points deducted immediately at redemption")
    print()
    
    customers = load_state("customers")
    if not customers:
        print("[ERROR] No customers. Run verify_seed_10_register.py first.")
        return []
    
    # Get reward catalog
    rewards = get_reward_catalog()
    if not rewards:
        print("[WARN] No available rewards found (may be out of stock).")
        return []
    
    print(f"[*] Found {len(rewards)} available rewards")
    for r in rewards[:5]:
        print(f"    - {r['name']}: {r['points_cost']} pts")
    if len(rewards) > 5:
        print(f"    ... and {len(rewards) - 5} more")
    print()
    
    # Each customer redeems 0-2 rewards based on their points
    redeemed = 0
    failed = 0
    results = []
    
    for c in customers:
        user_id = c["user_id"]
        token = c.get("token")
        name = c.get("name", f"User {user_id}")
        if not token:
            continue
        
        # Check customer's points
        points_balance = get_customer_points(token)
        if points_balance < 80:  # Minimum reward cost
            print(f"  {name}: insufficient points ({points_balance})")
            continue
        
        user_rewards = []
        num_to_redeem = random.randint(0, 2)
        
        for i in range(num_to_redeem):
            # Filter rewards customer can afford
            affordable = [r for r in rewards if r["points_cost"] <= points_balance]
            if not affordable:
                break
            
            reward = random.choice(affordable)
            success, code, err = redeem_reward_for_customer(reward["id"], token)
            
            if success and code:
                redeemed += 1
                points_balance -= reward["points_cost"]
                user_rewards.append({
                    "reward_id": reward["id"],
                    "name": reward["name"],
                    "redemption_code": code,
                    "points_cost": reward["points_cost"],
                })
                print(f"  {name} redeemed '{reward['name']}' ({reward['points_cost']} pts) → {code}")
            else:
                failed += 1
                print(f"  {name} failed to redeem '{reward['name']}': {err}")
        
        if user_rewards:
            results.append({
                "user_id": user_id,
                "name": name,
                "rewards": user_rewards,
            })
    
    print()
    print(f"[SUMMARY] {redeemed} rewards redeemed, {failed} failed")
    print(f"  {len(results)} customers redeemed rewards")
    
    # Save redeemed rewards to state
    save_state("redeemed_rewards", results)
    
    return results


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_15_redeem_rewards.py")
    except Exception as e:
        print(f"\n[FAILED] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
