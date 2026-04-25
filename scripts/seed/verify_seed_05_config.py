"""
SEED SCRIPT: verify_seed_05_config.py
Purpose: Create 4 loyalty tiers + system config
APIs tested: POST /admin/loyalty-tiers, PUT /admin/config, GET /admin/loyalty-tiers
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: None
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_put, api_get, admin_token, print_header
import db_validate


LOYALTY_TIERS = [
    {"name": "Bronze",   "min_points": 0,    "points_multiplier": 1.0,  "sort_order": 1,
     "benefits": {"discount_pct": 0,   "free_delivery": False, "priority_support": False}},
    {"name": "Silver",   "min_points": 1000,  "points_multiplier": 1.25, "sort_order": 2,
     "benefits": {"discount_pct": 5,   "free_delivery": False, "priority_support": False}},
    {"name": "Gold",     "min_points": 3000,  "points_multiplier": 1.5,  "sort_order": 3,
     "benefits": {"discount_pct": 10,  "free_delivery": True,  "priority_support": False}},
    {"name": "Platinum", "min_points": 5000, "points_multiplier": 2.0,  "sort_order": 4,
     "benefits": {"discount_pct": 15,  "free_delivery": True,  "priority_support": True}},
]


CONFIG_KEYS = [
    {"key": "loyalty_enabled",           "value": "true"},
    {"key": "loyalty_points_per_rmse",   "value": "1"},
    {"key": "min_order_amount",           "value": "10.00"},
    {"key": "delivery_fee",              "value": "5.00"},
    {"key": "pickup_lead_minutes",       "value": "15"},
    {"key": "currency",                  "value": "MYR"},
    {"key": "max_vouchers_per_user",     "value": "10"},
    {"key": "voucher_expiry_days",       "value": "30"},
    {"key": "points_redemption_rate",    "value": "0.01"},
    {"key": "referral_bonus_points",      "value": "100"},
    {"key": "referral_reward_amount",     "value": "5.00"},
    {"key": "referral_min_orders",        "value": "1"},
]


def run():
    print_header("STEP 05: Create Loyalty Tiers + System Config")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    print(f"\n[*] Creating {len(LOYALTY_TIERS)} loyalty tiers...")
    for t in LOYALTY_TIERS:
        resp = api_post("/admin/loyalty-tiers", token=token, json=t)
        if resp.status_code == 201:
            print(f"  ✓ Created: {t['name']}")
        elif resp.status_code in (400, 409, 500):
            # Check if tier already exists via API
            resp_check = api_get("/admin/loyalty-tiers", token=token)
            if resp_check.status_code == 200:
                tiers = resp_check.json()
                tier_names = [tier.get("name") for tier in tiers]
                if t["name"] in tier_names:
                    print(f"  - Already exists: {t['name']}")
                else:
                    raise RuntimeError(f"Create loyalty tier '{t['name']}' failed: {resp.status_code} {resp.text}")
            else:
                raise RuntimeError(f"Create loyalty tier '{t['name']}' failed: {resp.status_code} {resp.text}")
        else:
            raise RuntimeError(f"Create loyalty tier '{t['name']}' failed: {resp.status_code} {resp.text}")

    print(f"\n[*] DB Validation: loyalty tiers...")
    ok, count, msg = db_validate.validate_loyalty_tiers(len(LOYALTY_TIERS))
    if not ok:
        raise RuntimeError(f"Loyalty tiers validation: {msg}")
    print(f"  ✓ {count} loyalty tiers in DB")

    print(f"\n[*] Verifying via GET /admin/loyalty-tiers...")
    resp = api_get("/admin/loyalty-tiers", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/loyalty-tiers failed: {resp.status_code}")
    tiers = resp.json()
    print(f"  ✓ API returned {len(tiers)} tiers: {[t['name'] for t in tiers]}")

    print(f"\n[*] Setting {len(CONFIG_KEYS)} system config keys...")
    for c in CONFIG_KEYS:
        resp = api_put(f"/admin/config?key={c['key']}", token=token, json={"value": c["value"]})
        if resp.status_code == 200:
            print(f"  ✓ {c['key']} = {c['value']}")
        else:
            raise RuntimeError(f"Set config '{c['key']}' failed: {resp.status_code} {resp.text}")

    print(f"\n[*] DB Validation: config keys...")
    keys_dict = {c["key"]: c["value"] for c in CONFIG_KEYS}
    ok, count, msg = db_validate.validate_config_keys(keys_dict)
    if not ok:
        raise RuntimeError(f"Config keys validation: {msg}")
    print(f"  ✓ {count} config keys in DB")

    print(f"\n[✓] STEP 05 complete — {len(LOYALTY_TIERS)} tiers, {len(CONFIG_KEYS)} config keys")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_05_config.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)