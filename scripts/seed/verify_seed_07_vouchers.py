"""
SEED SCRIPT: verify_seed_07_vouchers.py
Purpose: Create 5 checkout vouchers (3 active, 2 expired with valid_until in past)
APIs tested: POST /admin/vouchers, GET /admin/vouchers
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_05_config.py (runs standalone, no hard deps)
"""

import sys, os
from datetime import datetime, timezone
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, admin_token, print_header
import db_validate


NOW = datetime.now(timezone.utc)


VOUCHERS = [
    {
        "code": "WELCOME10",
        "title": "Welcome 10% Off",
        "discount_type": "percent",
        "discount_value": 10,
        "min_spend": 25.00,
        "max_uses": 1000,
        "max_uses_per_user": 1,
        "valid_until": "2027-01-01T00:00:00Z",
        "short_description": "Welcome discount - 10% off your order",
        "description": "New customer welcome offer",
        "terms": ["Valid for new customers only", "Min order RM25"],
        "how_to_redeem": "Enter code at checkout",
    },
    {
        "code": "SAVE5RM",
        "title": "Save RM5",
        "discount_type": "fixed",
        "discount_value": 5.00,
        "min_spend": 20.00,
        "max_uses": 500,
        "max_uses_per_user": 1,
        "valid_until": "2027-06-30T00:00:00Z",
        "short_description": "RM5 off your order",
        "description": "RM5 fixed discount",
        "terms": ["Min order RM20", "Cannot be combined with other offers"],
        "how_to_redeem": "Enter code at checkout",
    },
    {
        "code": "FREECOFFEE",
        "title": "Free Coffee",
        "discount_type": "free_item",
        "discount_value": 15.00,
        "min_spend": 30.00,
        "max_uses": 100,
        "max_uses_per_user": 1,
        "valid_until": "2027-03-15T00:00:00Z",
        "short_description": "Free coffee on us",
        "description": "Free coffee when you spend RM30+",
        "terms": ["Min order RM30", "Free coffee item up to RM15 value"],
        "how_to_redeem": "Enter code at checkout",
    },
    {
        "code": "EXPIRED20",
        "title": "Expired 20% Off",
        "discount_type": "percent",
        "discount_value": 20,
        "min_spend": 15.00,
        "max_uses": 200,
        "max_uses_per_user": 1,
        "valid_until": "2025-01-01T00:00:00Z",
        "short_description": "Expired offer - 20% off",
        "description": "This offer has expired",
        "terms": ["Expired voucher"],
        "how_to_redeem": "No longer valid",
    },
    {
        "code": "OLDSAVE",
        "title": "Old Save RM8",
        "discount_type": "fixed",
        "discount_value": 8.00,
        "min_spend": 25.00,
        "max_uses": 300,
        "max_uses_per_user": 1,
        "valid_until": "2025-06-01T00:00:00Z",
        "short_description": "Old expired offer",
        "description": "This offer has expired",
        "terms": ["Expired voucher"],
        "how_to_redeem": "No longer valid",
    },
]


def run():
    print_header("STEP 07: Create Checkout Vouchers")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    created_ids = []
    print(f"\n[*] Creating {len(VOUCHERS)} vouchers...")
    for v in VOUCHERS:
        resp = api_post("/admin/vouchers", token=token, json=v)
        if resp.status_code == 201:
            voucher = resp.json()
            print(f"  ✓ Created: {v['code']} (id={voucher['id']})")
            created_ids.append(voucher["id"])
        elif resp.status_code in (400, 409, 500):
            # Check if voucher already exists via API
            resp_check = api_get("/admin/vouchers", token=token)
            if resp_check.status_code == 200:
                data = resp_check.json()
                vouchers_list = data if isinstance(data, list) else data.get("vouchers", [])
                existing_voucher = None
                for voucher in vouchers_list:
                    if voucher.get("code") == v["code"]:
                        existing_voucher = voucher
                        break
                if existing_voucher:
                    print(f"  - Already exists: {v['code']} (id={existing_voucher['id']})")
                    created_ids.append(existing_voucher["id"])
                else:
                    raise RuntimeError(f"Create voucher '{v['code']}' failed: {resp.status_code} {resp.text}")
            else:
                raise RuntimeError(f"Create voucher '{v['code']}' failed: {resp.status_code} {resp.text}")
        else:
            raise RuntimeError(f"Create voucher '{v['code']}' failed: {resp.status_code} {resp.text}")

    print(f"\n[*] DB Validation: vouchers...")
    ok, count, msg = db_validate.validate_vouchers(len(VOUCHERS))
    if not ok:
        raise RuntimeError(f"Vouchers validation: {msg}")
    print(f"  ✓ {msg}")

    print(f"[*] Validating specific voucher codes for seed_07...")
    codes = ["WELCOME10", "SAVE5RM", "FREECOFFEE", "EXPIRED20", "OLDSAVE"]
    future_codes = ["WELCOME10", "SAVE5RM", "FREECOFFEE"]
    past_codes = ["EXPIRED20", "OLDSAVE"]
    
    # Check via API
    resp = api_get("/admin/vouchers", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/vouchers failed: {resp.status_code}")
    data = resp.json()
    vouchers_list = data if isinstance(data, list) else data.get("vouchers", [])
    
    found_codes = {}
    for voucher in vouchers_list:
        if voucher.get("code") in codes:
            found_codes[voucher["code"]] = voucher.get("valid_until")
    
    missing = [c for c in codes if c not in found_codes]
    if missing:
        raise RuntimeError(f"Vouchers validation: missing codes: {missing}")
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    def to_aware(dt):
        if dt and dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    
    future_count = sum(1 for c in future_codes if found_codes.get(c) and to_aware(datetime.fromisoformat(found_codes[c].replace('Z', '+00:00'))) > now)
    past_count = sum(1 for c in past_codes if found_codes.get(c) and to_aware(datetime.fromisoformat(found_codes[c].replace('Z', '+00:00'))) < now)
    if future_count == 3 and past_count == 2:
        print(f"  ✓ 3 future-valid, 2 expired vouchers (by specific code)")
    else:
        raise RuntimeError(f"Voucher expiry: expected 3 future/2 past, found {future_count}/{past_count}")

    print(f"\n[*] Verifying via GET /admin/vouchers...")
    resp = api_get("/admin/vouchers", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/vouchers failed: {resp.status_code}")
    data = resp.json()
    vouchers = data if isinstance(data, list) else data.get("vouchers", [])
    print(f"  ✓ API returned {len(vouchers)} vouchers")

    print(f"\n[✓] STEP 07 complete — 5 checkout vouchers (3 future expiry, 2 past expiry)")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_07_vouchers.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)