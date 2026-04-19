"""
SEED SCRIPT: verify_seed_06_rewards.py
Purpose: Create 8 loyalty rewards (6 active, 2 inactive/expired)
APIs tested: GET /stores/0/menu (fetch menu items), POST /admin/rewards, PUT /admin/rewards/{id}, GET /admin/rewards
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_05_config.py (loyalty tiers), verify_seed_02_menu.py (menu items must exist)
Flow:
  1. Call GET /stores/0/menu to fetch all menu items via API
  2. Extract item IDs for rewards
  3. Create rewards referencing real menu item IDs
  4. Create active rewards first, then mark expired ones as inactive
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_put, api_get, admin_token, print_header
import db_validate


def get_menu_items_for_rewards():
    """
    Fetch menu items via GET /stores/0/menu API.
    Returns dict mapping item names to their IDs.
    """
    token = admin_token()
    resp = api_get("/stores/0/menu", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch menu items: {resp.status_code} {resp.text}")
    
    data = resp.json()
    categories = data.get("categories", [])
    
    # Build item map from all categories
    items = {}
    for cat in categories:
        for item in cat.get("items", []):
            name = item.get("name", "").lower()
            item_id = item.get("id")
            if name and item_id:
                items[name] = item_id
    
    return items


def run():
    print_header("STEP 06: Create Loyalty Rewards")
    
    # Step 1: Get actual menu item IDs from database
    print("[*] Fetching menu items from database...")
    menu_items = get_menu_items_for_rewards()
    print(f"  Found {len(menu_items)} menu items")
    
    # Map item names to IDs (with fallback if name not found)
    item_map = {
        'caramel latte': menu_items.get('caramel latte'),
        'croissant': menu_items.get('croissant'),
        'tiramisu': menu_items.get('tiramisu'),
        'loka tumbler': menu_items.get('loka tumbler'),
        'americano': menu_items.get('americano'),
    }
    
    # Verify all required items exist
    missing = [name for name, id in item_map.items() if id is None]
    if missing:
        raise RuntimeError(f"Required menu items not found: {missing}")
    
    print(f"  ✓ Mapped {len(item_map)} items for rewards")
    
    # Step 2: Define rewards with actual DB IDs
    rewards = [
        {
            "name": "Free Caramel Latte",
            "code": "RWD-FREE-LATTE",
            "points_cost": 150,
            "reward_type": "free_item",
            "item_id": item_map['caramel latte'],
            "stock_limit": 100,
            "short_description": "Redeem for a free Caramel Latte",
            "terms": ["Valid for 30 days from redemption", "One reward per customer"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "Free Croissant",
            "code": "RWD-FREE-CROISSANT",
            "points_cost": 120,
            "reward_type": "free_item",
            "item_id": item_map['croissant'],
            "stock_limit": 50,
            "short_description": "Redeem for a free Croissant",
            "terms": ["Valid for 30 days from redemption", "One reward per customer"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "Free Tiramisu",
            "code": "RWD-FREE-TIRAMISU",
            "points_cost": 200,
            "reward_type": "free_item",
            "item_id": item_map['tiramisu'],
            "stock_limit": 30,
            "short_description": "Redeem for a free Tiramisu",
            "terms": ["Valid for 30 days from redemption", "One reward per customer"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "Free Loka Tumbler",
            "code": "RWD-FREE-TUMBLER",
            "points_cost": 500,
            "reward_type": "free_item",
            "item_id": item_map['loka tumbler'],
            "stock_limit": 10,
            "short_description": "Redeem for a free Loka Tumbler",
            "terms": ["Valid for 30 days from redemption", "While stocks last"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "RM5 Off Your Order",
            "code": "RWD-5OFF",
            "points_cost": 100,
            "reward_type": "discount_voucher",
            "discount_value": 5.00,
            "min_spend": 15.00,
            "stock_limit": 200,
            "short_description": "RM5 off your next order",
            "terms": ["Valid for 30 days from redemption", "Min order RM15"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "Mystery Reward",
            "code": "RWD-MYSTERY",
            "points_cost": 250,
            "reward_type": "custom",
            "stock_limit": 50,
            "short_description": "Mystery reward - could be anything!",
            "terms": ["Valid for 30 days from redemption"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "Free Americano",
            "code": "RWD-FREE-AMERICANO",
            "points_cost": 80,
            "reward_type": "free_item",
            "item_id": item_map['americano'],
            "stock_limit": 0,
            "is_active": False,
            "short_description": "Expired - Free Americano (no longer available)",
            "terms": ["This reward has expired"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
        {
            "name": "RM10 Off",
            "code": "RWD-10OFF",
            "points_cost": 300,
            "reward_type": "discount_voucher",
            "discount_value": 10.00,
            "min_spend": 20.00,
            "stock_limit": 0,
            "is_active": False,
            "short_description": "Expired - RM10 off (no longer available)",
            "terms": ["This reward has expired"],
            "how_to_redeem": "Visit any Loka outlet and show your reward code to staff",
        },
    ]
    
    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")
    
    # Step 3: Create rewards
    created_ids = []
    print(f"\n[*] Creating {len(rewards)} rewards...")
    for r in rewards:
        resp = api_post("/admin/rewards", token=token, json=r)
        if resp.status_code == 201:
            reward = resp.json()
            print(f"  ✓ Created: {r['name']} (id={reward['id']})")
            created_ids.append(reward["id"])
            
            if r.get("is_active") is False:
                update_resp = api_put(f"/admin/rewards/{reward['id']}", token=token, json={"is_active": False})
                if update_resp.status_code == 200:
                    print(f"    → Marked inactive (expired)")
                else:
                    print(f"    → Warning: could not mark inactive: {update_resp.status_code}")
        elif resp.status_code in (400, 409):  # Conflict or bad request
            # Check if reward already exists via API
            resp_check = api_get("/admin/rewards", token=token)
            if resp_check.status_code == 200:
                data = resp_check.json()
                rewards_list = data if isinstance(data, list) else data.get("rewards", [])
                existing_reward = None
                for reward in rewards_list:
                    if reward.get("code") == r["code"]:
                        existing_reward = reward
                        break
                if existing_reward:
                    print(f"  - Already exists: {r['name']} (id={existing_reward['id']}, is_active={existing_reward.get('is_active')})")
                    created_ids.append(existing_reward["id"])
                    if r.get("is_active") is False and existing_reward.get("is_active"):
                        update_resp = api_put(f"/admin/rewards/{existing_reward['id']}", token=token, json={"is_active": False})
                        if update_resp.status_code == 200:
                            print(f"    → Marked inactive (expired)")
                else:
                    raise RuntimeError(f"Create reward '{r['name']}' failed: {resp.status_code} {resp.text}")
            else:
                raise RuntimeError(f"Create reward '{r['name']}' failed: {resp.status_code} {resp.text}")
        else:
            raise RuntimeError(f"Create reward '{r['name']}' failed: {resp.status_code} {resp.text}")
    
    print(f"\n[*] DB Validation: rewards...")
    ok, count, msg = db_validate.validate_rewards(len(rewards))
    if not ok:
        raise RuntimeError(f"Rewards validation: {msg}")
    print(f"  ✓ {msg}")
    
    active_count = sum(1 for r in rewards if r.get("is_active") is not False)
    inactive_count = len(rewards) - active_count
    ok2, count2, msg2 = db_validate.validate_reward_active_counts(active_count, inactive_count)
    if not ok2:
        raise RuntimeError(f"Reward active/inactive counts: {msg2}")
    print(f"  ✓ {msg2}")
    
    print(f"\n[*] Verifying via GET /admin/rewards...")
    resp = api_get("/admin/rewards", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/rewards failed: {resp.status_code}")
    data = resp.json()
    api_rewards = data if isinstance(data, list) else data.get("rewards", [])
    print(f"  ✓ API returned {len(api_rewards)} rewards")
    
    print(f"\n[✓] STEP 06 complete — {len(api_rewards)} rewards ({active_count} active, {inactive_count} inactive)")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] verify_seed_06_rewards.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
