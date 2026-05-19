#!/usr/bin/env python3
"""
Seed orders and reservations for kitchen/reservations page testing.
"""

import sys
import jwt
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:13800/api/v1"
JWT_SECRET = "super-secret-jwt-key-for-development-only-12345"
JWT_ALGORITHM = "HS256"
ADMIN_ID = 2

STORE_ID = 2  # LOKA Espresso Pavilion
CUSTOMER_ID = 40  # Test Customer 1
TABLE_ID = 45  # T23


def gen_admin_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(ADMIN_ID),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(hours=2),
        "iss": "fnb-enterprise-v3",
        "aud": "fnb-app",
        "jti": "seed-orders-001",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def api(method: str, path: str, token: str, json=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    resp = requests.request(method, url, headers=headers, json=json, timeout=30)
    try:
        data = resp.json()
    except Exception:
        data = {"_raw": resp.text}
    if not resp.ok:
        print(f"  ERROR {resp.status_code}: {data}")
        return None
    return data.get("data", data)


def main():
    print("=== Seeding Orders & Reservations ===\n")
    token = gen_admin_token()

    # 1. Create orders for kitchen page
    print("1. Creating orders for kitchen page...")
    order_payloads = [
        {
            "store_id": STORE_ID,
            "customer_id": CUSTOMER_ID,
            "dining_table_id": TABLE_ID,
            "order_type": "dine_in",
            "line_items": [
                {"menu_item_id": 1, "quantity": 2, "modifier_ids": []},
                {"menu_item_id": 3, "quantity": 1, "modifier_ids": []},
            ],
        },
        {
            "store_id": STORE_ID,
            "customer_id": CUSTOMER_ID,
            "order_type": "takeaway",
            "line_items": [
                {"menu_item_id": 2, "quantity": 1, "modifier_ids": []},
                {"menu_item_id": 5, "quantity": 2, "modifier_ids": []},
            ],
        },
        {
            "store_id": STORE_ID,
            "customer_id": CUSTOMER_ID,
            "dining_table_id": TABLE_ID,
            "order_type": "dine_in",
            "line_items": [
                {"menu_item_id": 7, "quantity": 1, "modifier_ids": []},
                {"menu_item_id": 9, "quantity": 1, "modifier_ids": []},
                {"menu_item_id": 10, "quantity": 1, "modifier_ids": []},
            ],
        },
    ]

    created_orders = []
    for i, payload in enumerate(order_payloads, 1):
        r = api("POST", "/staff/pos/orders", token, json=payload)
        if r:
            print(f"   Order {i} created: #{r.get('order_number', 'N/A')} — Total: RM {r.get('total', 0)}")
            created_orders.append(r)
        else:
            print(f"   Order {i} failed")

    # 2. Create reservations
    print("\n2. Creating reservations...")
    today = datetime.now(timezone.utc)
    reservation_payloads = [
        {
            "store_id": STORE_ID,
            "customer_id": CUSTOMER_ID,
            "customer_name": "Test Customer 1",
            "customer_phone": "+60120000001",
            "party_size": 4,
            "reservation_date": today.strftime("%Y-%m-%d"),
            "reservation_time": "18:00",
            "status": "confirmed",
            "special_requests": "Window seat preferred",
            "dining_table_id": TABLE_ID,
        },
        {
            "store_id": STORE_ID,
            "customer_id": CUSTOMER_ID,
            "customer_name": "Test Customer 2",
            "customer_phone": "+60120000002",
            "party_size": 2,
            "reservation_date": today.strftime("%Y-%m-%d"),
            "reservation_time": "19:30",
            "status": "confirmed",
            "special_requests": "Birthday celebration",
        },
        {
            "store_id": STORE_ID,
            "customer_id": None,
            "customer_name": "Walk-in Guest",
            "customer_phone": "+60123456789",
            "party_size": 6,
            "reservation_date": (today + timedelta(days=1)).strftime("%Y-%m-%d"),
            "reservation_time": "12:00",
            "status": "requested",
            "special_requests": "High chair needed",
        },
    ]

    for i, payload in enumerate(reservation_payloads, 1):
        r = api("POST", "/admin/reservations", token, json=payload)
        if r:
            print(f"   Reservation {i} created: {r.get('customer_name')} — {r.get('party_size')}pax at {r.get('reservation_time')}")
        else:
            print(f"   Reservation {i} failed")

    # 3. Verify
    print("\n3. Verifying...")
    orders = api("GET", f"/admin/orders?store_id={STORE_ID}&per_page=10", token)
    if orders:
        items = orders.get("items", [])
        print(f"   Total orders for store {STORE_ID}: {len(items)}")

    reservations = api("GET", f"/admin/reservations?store_id={STORE_ID}&per_page=10", token)
    if reservations:
        items = reservations.get("items", [])
        print(f"   Total reservations for store {STORE_ID}: {len(items)}")

    print("\n=== Done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
