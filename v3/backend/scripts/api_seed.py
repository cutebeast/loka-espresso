#!/usr/bin/env python3
"""
API-based seeding script for v3 backend.
Uses admin JWT (generated directly with known secret) to create test data
via API endpoints, validating each endpoint along the way.

Usage:
    python3 api_seed.py
"""

import sys
import jwt
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:13800/api/v1"
JWT_SECRET = "super-secret-jwt-key-for-development-only-12345"
JWT_ALGORITHM = "HS256"

ADMIN_ID = 2  # admin@lokaespresso.my


def gen_admin_token() -> str:
    """Generate a valid admin access token using the known JWT secret."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(ADMIN_ID),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": "seed-script-001",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def gen_customer_token(customer_id: int) -> str:
    """Generate a valid customer access token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id),
        "type": "access",
        "customer_id": customer_id,
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": f"seed-cust-{customer_id}",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def api(method: str, path: str, token: str | None = None, json=None, params=None):
    """Make an API call and return response JSON or raise."""
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = requests.request(method, url, headers=headers, json=json, params=params, timeout=30)
    try:
        data = resp.json()
    except Exception:
        data = {"_raw": resp.text}
    if not resp.ok:
        print(f"  ERROR {resp.status_code}: {data}")
        return None
    return data


def main():
    print("=== FNB v3 API Seeding Script ===\n")

    admin_token = gen_admin_token()
    print("1. Admin token generated")

    # ------------------------------------------------------------------
    # 2. Create test customers (or reuse existing test customers)
    # ------------------------------------------------------------------
    print("\n2. Creating / finding test customers...")
    customers = []
    for i in range(1, 4):
        phone = f"+6012{i:07d}"
        # Search existing
        r = api("GET", "/admin/customers", token=admin_token, params={"search": phone})
        existing = None
        if r and r.get("data") and r["data"].get("items"):
            for item in r["data"]["items"]:
                if item.get("phone_number") == phone:
                    existing = item
                    break
        if existing:
            cid = existing["id"]
            print(f"   Reusing customer {cid}: {existing['display_name']} ({phone})")
            customers.append({"id": cid, "phone": phone, "name": existing["display_name"]})
            continue

        payload = {
            "phone_number": phone,
            "display_name": f"Test Customer {i}",
            "email_address": f"test{i}@example.com",
        }
        r = api("POST", "/admin/customers", token=admin_token, json=payload)
        if r and r.get("data"):
            cid = r["data"]["id"]
            print(f"   Created customer {cid}: {payload['display_name']} ({phone})")
            customers.append({"id": cid, "phone": phone, "name": payload["display_name"]})
        else:
            print(f"   Failed to create customer {i}")

    if not customers:
        print("No customers available. Exiting.")
        return 1

    # ------------------------------------------------------------------
    # 3. Wallet top-ups
    # ------------------------------------------------------------------
    print("\n3. Topping up wallets...")
    for c in customers:
        for amount in [10.0, 25.0]:
            r = api("POST", "/admin/wallets/topup", token=admin_token, json={
                "customer_id": c["id"],
                "amount": amount,
                "reason": "Seed top-up",
            })
            if r and r.get("data"):
                print(f"   Customer {c['id']}: +MYR {amount:.2f} (balance: {r['data'].get('new_balance')})")
            else:
                print(f"   Customer {c['id']}: top-up FAILED for {amount}")

    # ------------------------------------------------------------------
    # 4. Adjust loyalty points
    # ------------------------------------------------------------------
    print("\n4. Adjusting loyalty points...")
    for c in customers:
        r = api("POST", f"/admin/customers/{c['id']}/adjust-points", token=admin_token, json={
            "points": 200,
            "reason": "Seed points",
        })
        if r and r.get("data"):
            print(f"   Customer {c['id']}: +200 pts (balance: {r['data'].get('new_balance')})")
        else:
            print(f"   Customer {c['id']}: points adjustment FAILED")

    # ------------------------------------------------------------------
    # 5. Create reward catalog entries (reuse if exist)
    # ------------------------------------------------------------------
    print("\n5. Creating reward catalog entries...")
    rewards = []
    # Fetch existing rewards
    existing_rewards = {}
    r = api("GET", "/admin/rewards", token=admin_token, params={"per_page": 100})
    if r and r.get("data") and r["data"].get("items"):
        for item in r["data"]["items"]:
            existing_rewards[item["reward_key"]] = item

    reward_defs = [
        {
            "reward_name": "Free Coffee",
            "reward_key": "free_coffee",
            "reward_type": "free_item",
            "short_description": "One free regular coffee",
            "long_description": "Redeem for any regular brewed coffee.",
            "points_cost": 100,
            "validity_days": 30,
            "is_active": True,
        },
        {
            "reward_name": "20% Off Pastry",
            "reward_key": "pastry_20off",
            "reward_type": "percentage_discount",
            "short_description": "20% discount on any pastry",
            "long_description": "Valid for all pastries in-store.",
            "points_cost": 150,
            "discount_value": 20.0,
            "validity_days": 14,
            "is_active": True,
        },
    ]
    for rd in reward_defs:
        if rd["reward_key"] in existing_rewards:
            item = existing_rewards[rd["reward_key"]]
            print(f"   Reusing reward {item['id']}: {rd['reward_name']} ({rd['points_cost']} pts)")
            rewards.append({"id": item["id"], **rd})
            continue
        r = api("POST", "/admin/rewards", token=admin_token, json=rd)
        if r and r.get("data"):
            rid = r["data"]["id"]
            print(f"   Created reward {rid}: {rd['reward_name']} ({rd['points_cost']} pts)")
            rewards.append({"id": rid, **rd})
        else:
            print(f"   Failed to create reward: {rd['reward_name']}")

    # ------------------------------------------------------------------
    # 6. Redeem rewards as customers (public API)
    # ------------------------------------------------------------------
    print("\n6. Redeeming rewards for customers...")
    for c in customers:
        cust_token = gen_customer_token(c["id"])
        for rew in rewards:
            r = api("POST", f"/rewards/{rew['id']}/redeem", token=cust_token)
            if r and r.get("data"):
                print(f"   Customer {c['id']}: redeemed {rew['reward_name']} (code: {r['data'].get('redemption_code')})")
            else:
                print(f"   Customer {c['id']}: redeem FAILED for {rew['reward_name']}")

    # ------------------------------------------------------------------
    # 7. Create voucher definitions (reuse if exist)
    # ------------------------------------------------------------------
    print("\n7. Creating voucher definitions...")
    vouchers = []
    # Fetch existing vouchers
    existing_vouchers = {}
    r = api("GET", "/admin/vouchers", token=admin_token, params={"per_page": 100})
    if r and r.get("data") and r["data"].get("items"):
        for item in r["data"]["items"]:
            existing_vouchers[item["voucher_code"]] = item

    now = datetime.now(timezone.utc)
    voucher_defs = [
        {
            "display_title": "Welcome Voucher",
            "voucher_code": "WELCOME10",
            "voucher_type": "percentage_off",
            "discount_value": 10.0,
            "minimum_order_value": 20.0,
            "valid_from": now.isoformat(),
            "valid_until": (now + timedelta(days=30)).isoformat(),
            "is_active": True,
        },
        {
            "display_title": "Birthday Treat",
            "voucher_code": "BIRTHDAY5",
            "voucher_type": "fixed_amount_off",
            "discount_value": 5.0,
            "minimum_order_value": 10.0,
            "valid_from": now.isoformat(),
            "valid_until": (now + timedelta(days=7)).isoformat(),
            "is_active": True,
        },
    ]
    for vd in voucher_defs:
        if vd["voucher_code"] in existing_vouchers:
            item = existing_vouchers[vd["voucher_code"]]
            print(f"   Reusing voucher {item['id']}: {vd['display_title']} ({vd['voucher_code']})")
            vouchers.append({"id": item["id"], **vd})
            continue
        r = api("POST", "/admin/vouchers", token=admin_token, json=vd)
        if r and r.get("data"):
            vid = r["data"]["id"]
            print(f"   Created voucher {vid}: {vd['display_title']} ({vd['voucher_code']})")
            vouchers.append({"id": vid, **vd})
        else:
            print(f"   Failed to create voucher: {vd['display_title']}")

    # ------------------------------------------------------------------
    # 8. Award vouchers to customers
    # ------------------------------------------------------------------
    print("\n8. Awarding vouchers to customers...")
    for c in customers:
        for v in vouchers:
            r = api("POST", f"/admin/customers/{c['id']}/award-voucher", token=admin_token, json={
                "voucher_id": v["id"],
                "reason": "Seed voucher",
            })
            if r and r.get("data"):
                print(f"   Customer {c['id']}: awarded {v['display_title']} (code: {r['data'].get('voucher_code')})")
            else:
                print(f"   Customer {c['id']}: award FAILED for {v['display_title']}")

    # ------------------------------------------------------------------
    # 9. Verify wallet + rewards + vouchers for each customer
    # ------------------------------------------------------------------
    print("\n9. Verifying customer wallet data...")
    for c in customers:
        r = api("GET", f"/admin/customers/{c['id']}/wallet", token=admin_token)
        if r and r.get("data"):
            data = r["data"]
            print(f"   Customer {c['id']}: {len(data.get('rewards', []))} rewards, {len(data.get('vouchers', []))} vouchers")
        else:
            print(f"   Customer {c['id']}: wallet check FAILED")

    print("\n=== Seeding complete ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
