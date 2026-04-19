"""
SEED SCRIPT: verify_seed_18_redeem_rewards.py
Purpose: Customer redeems rewards using loyalty points
Per order_flow_status_guide.md:
  - Customer browses reward catalog
  - Customer redeems reward (deducts points immediately)
  - Redemption code created for use at checkout
  
APIs tested: GET /rewards, POST /rewards/{reward_id}/redeem
Status: CERTIFIED-2026-04-17 | Redeem rewards for points
Dependencies: verify_seed_12_place_orders.py (customers must exist, need loyalty points)
NO direct DB inserts — ALL via API calls.
"""

import sys, os, random
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    api_post, api_get, save_state, load_state, print_header,
)
import db_validate


def get_reward_catalog():
    """Get available rewards from catalog.
    
    Note: The catalog endpoint doesn't expose stock_remaining, so we
    don't filter by stock here. The API will properly reject redemptions
    when stock is exhausted.
    """
    resp = api_get("/rewards")
    if resp.status_code != 200:
        return []
    
    rewards = []
    for r in resp.json():
        rewards.append({
            "id": r["id"],
            "name": r["name"],
            "points_cost": r["points_cost"],
        })
    return rewards


def redeem_reward_for_customer(reward_id, customer_token):
    """Redeem a reward. Returns (success, redemption_code, error)"""
    resp = api_post(f"/rewards/{reward_id}/redeem", token=customer_token)
    if resp.status_code in (200, 201):
        data = resp.json()
        return True, data.get("redemption_code"), None
    return False, None, f"{resp.status_code}: {resp.text[:100]}"


def get_customer_points(customer_token):
    """Get customer's loyalty points balance."""
    resp = api_get("/loyalty/balance", token=customer_token)
    if resp.status_code == 200:
        data = resp.json()
        return data.get("points_balance", 0)
    return 0


def run():
    print_header("STEP 18: Redeem Rewards using Loyalty Points")
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
    customer_rewards = {}  # user_id -> list of {reward_id, redemption_code}
    
    for c in customers:
        user_id = c["user_id"]
        token = c.get("token")
        if not token:
            continue
        
        # Check customer's points
        points_balance = get_customer_points(token)
        if points_balance < 80:  # Minimum reward cost
            print(f"  {c['name']}: insufficient points ({points_balance})")
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
                })
                print(f"  {c['name']} redeemed '{reward['name']}' → {code}")
            else:
                failed += 1
        
        if user_rewards:
            customer_rewards[user_id] = user_rewards
            results.append({
                "user_id": user_id,
                "name": c["name"],
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
        print("\n[SUCCESS] verify_seed_18_redeem_rewards.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
