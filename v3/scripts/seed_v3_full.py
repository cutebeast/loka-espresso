#!/usr/bin/env python3
"""
FNB Enterprise v3 — COMPREHENSIVE API SEED SCRIPT
==================================================
Populates demo data via API calls ONLY (no direct DB access).
Uses: admin@loyaltysystem.uk / admin123

Usage: cd /root/fnb-super-app/v3 && python3 scripts/seed_v3_full.py
"""

import os
import sys
import time
import uuid
import random
import requests
from datetime import date, datetime, timezone, timedelta, time as dt_time

API_BASE = os.environ.get("API_BASE", "http://localhost:13800/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

# ── Admin token cache ──────────────────────────────────────────────
_admin_token = None

def get_admin_token():
    global _admin_token
    if _admin_token:
        return _admin_token
    resp = requests.post(f"{API_BASE}/admin/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASS,
    }, timeout=10)
    if resp.status_code != 200:
        print(f"[ERROR] Admin login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    _admin_token = resp.json()["tokens"]["access_token"]
    return _admin_token

def api_get(path, token=None, params=None):
    tok = token if token is not None else get_admin_token()
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    return requests.get(f"{API_BASE}{path}", headers=h, params=params, timeout=10)

def api_post(path, token=None, json=None):
    tok = token if token is not None else get_admin_token()
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    return requests.post(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_patch(path, token=None, json=None):
    tok = token if token is not None else get_admin_token()
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    return requests.patch(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_put(path, token=None, json=None):
    tok = token if token is not None else get_admin_token()
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    return requests.put(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_delete(path, token=None):
    tok = token if token is not None else get_admin_token()
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    return requests.delete(f"{API_BASE}{path}", headers=h, timeout=10)

def print_header(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")

def safe_get_items(resp, key="data"):
    """Extract list from various API response shapes."""
    if resp.status_code != 200:
        return []
    data = resp.json().get(key, [])
    if isinstance(data, dict):
        return data.get("items", []) if "items" in data else []
    return data if isinstance(data, list) else []

# ── Data ───────────────────────────────────────────────────────────

MORE_CUSTOMERS = [
    {"name": "Amirul Hakim", "email": "amirul@test.my", "phone": "+60123456701"},
    {"name": "Nurul Ain", "email": "nurul@test.my", "phone": "+60123456702"},
    {"name": "Hafiz Rahman", "email": "hafiz@test.my", "phone": "+60123456703"},
    {"name": "Siti Khadijah", "email": "khadijah@test.my", "phone": "+60123456704"},
    {"name": "Farhan Ismail", "email": "farhan@test.my", "phone": "+60123456705"},
    {"name": "Aisyah Abdullah", "email": "aisyah@test.my", "phone": "+60123456706"},
    {"name": "Zulkifli Mohamad", "email": "zulkifli@test.my", "phone": "+60123456707"},
    {"name": "Fatimah Zahra", "email": "fatimah@test.my", "phone": "+60123456708"},
    {"name": "Muhammad Afiq", "email": "afiq@test.my", "phone": "+60123456709"},
    {"name": "Nadia Hussain", "email": "nadia@test.my", "phone": "+60123456710"},
    {"name": "Rashid Khan", "email": "rashid@test.my", "phone": "+60123456711"},
    {"name": "Priya Menon", "email": "priya@test.my", "phone": "+60123456712"},
    {"name": "Chen Wei Ling", "email": "weiling@test.my", "phone": "+60123456713"},
    {"name": "Ahmad Fauzi", "email": "fauzi@test.my", "phone": "+60123456714"},
    {"name": "Lisa Tan", "email": "lisa@test.my", "phone": "+60123456715"},
    {"name": "Kumar Raj", "email": "kumar@test.my", "phone": "+60123456716"},
    {"name": "Sara Lee", "email": "sara@test.my", "phone": "+60123456717"},
    {"name": "Daniel Ong", "email": "daniel@test.my", "phone": "+60123456718"},
    {"name": "Maya Siva", "email": "maya@test.my", "phone": "+60123456719"},
    {"name": "Jason Lim", "email": "jason@test.my", "phone": "+60123456720"},
]

RESERVATIONS = [
    {"guest": "Sarah Tan", "phone": "+60123456789", "party": 4, "status": "confirmed"},
    {"guest": "Raj Kumar", "phone": "+60129876543", "party": 2, "status": "requested"},
    {"guest": "Mei Wong", "phone": "+60123459876", "party": 6, "status": "seated"},
    {"guest": "Aida Rahman", "phone": "+60127654321", "party": 3, "status": "confirmed"},
    {"guest": "Wei Chen", "phone": "+60123456780", "party": 8, "status": "completed"},
    {"guest": "Nina Lim", "phone": "+60129876000", "party": 2, "status": "no_show"},
    {"guest": "David Ong", "phone": "+60123451234", "party": 5, "status": "cancelled_by_guest"},
    {"guest": "Yuna Lee", "phone": "+60127654000", "party": 4, "status": "confirmed"},
]

CAMPAIGNS = [
    {"key": "summer2026", "name": "Summer Promo 2026", "channel": "push_notification", "status": "active", "type": "promotional", "audience": "all_customers"},
    {"key": "ramadan2026", "name": "Ramadan Special", "channel": "email", "status": "scheduled", "type": "promotional", "audience": "gold_platinum"},
    {"key": "newmenu2026", "name": "New Menu Launch", "channel": "in_app", "status": "draft", "type": "acquisition", "audience": "all_customers"},
    {"key": "weekend20", "name": "Weekend 20% Off", "channel": "sms", "status": "completed", "type": "promotional", "audience": "silver_gold"},
]

CONTENT_BLOCKS = [
    {"key": "hero_banner", "name": "Homepage Hero", "type": "hero_banner", "title": "Welcome to Loka Espresso", "body": "Premium coffee, freshly brewed daily", "order": 1, "active": True},
    {"key": "new_arrival", "name": "New Arrival Promo", "type": "promo_card", "title": "New: Gula Melaka Latte", "body": "Try our signature Malaysian twist", "order": 2, "active": True},
    {"key": "loyalty_cta", "name": "Loyalty CTA", "type": "info_card", "title": "Join Our Loyalty Program", "body": "Earn points with every purchase", "order": 3, "active": True},
]

SURVEYS = [
    {"key": "satisfaction_q2_2026", "name": "Customer Satisfaction Survey", "type": "post_order"},
    {"key": "menu_feedback", "name": "New Menu Feedback", "type": "in_app"},
]

# ── Seed Functions ─────────────────────────────────────────────────

created_customers = []

def seed_more_customers():
    print_header("SEED: Additional Customers")
    created = 0
    for cust in MORE_CUSTOMERS:
        resp = api_post("/auth/register", json={
            "email_address": cust["email"],
            "phone_number": cust["phone"],
            "display_name": cust["name"],
        })
        if resp.status_code in (200, 201):
            data = resp.json().get("data", {})
            created_customers.append({
                "id": data.get("user_id"),
                "name": cust["name"],
                "email": cust["email"],
                "phone": cust["phone"],
            })
            created += 1
            print(f"  [OK] {cust['name']}")
        else:
            # Try login (might already exist)
            resp2 = api_post("/auth/login", json={"phone_number": cust["phone"]})
            if resp2.status_code == 200:
                data = resp2.json().get("data", {})
                profile = data.get("profile", {})
                created_customers.append({
                    "id": data.get("user_id"),
                    "name": cust["name"],
                    "email": cust["email"],
                    "phone": cust["phone"],
                })
                print(f"  [SKIP] {cust['name']} already exists")
            else:
                print(f"  [FAIL] {cust['name']}: register={resp.status_code} login={resp2.status_code}")
    print(f"\n  Customers: {created} created, {len(created_customers)} total available")
    return created

def seed_reservations():
    print_header("SEED: Reservations")
    stores = safe_get_items(api_get("/admin/stores"))
    physical = [s for s in stores if s.get("slug") != "hq"]
    if not physical:
        print("  [WARN] No physical stores found")
        return 0
    store = physical[0]
    store_id = store["id"]

    tables = safe_get_items(api_get(f"/admin/stores/{store_id}/tables"))
    if not tables:
        print("  [WARN] No tables found")
        return 0

    created = 0
    today = date.today()
    for i, r in enumerate(RESERVATIONS):
        table = tables[i % len(tables)]
        # Get or create customer
        customer_id = None
        for c in created_customers:
            if c["name"] == r["guest"]:
                customer_id = c["id"]
                break
        resp = api_post("/admin/reservations", json={
            "store_id": store_id,
            "customer_id": customer_id,
            "dining_table_id": table.get("id"),
            "party_size": r["party"],
            "reservation_date": str(today + timedelta(days=random.randint(-7, 14))),
            "reservation_time": f"{random.randint(8,21):02d}:{random.choice(['00','15','30','45'])}",
            "status": r["status"],
            "duration_minutes": 90,
            "special_requests": "Window seat please" if random.random() > 0.5 else None,
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {r['guest']} ({r['party']} pax)")
        else:
            print(f"  [FAIL] {r['guest']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Reservations: {created} created")
    return created

def seed_marketing_campaigns():
    print_header("SEED: Marketing Campaigns")
    existing = safe_get_items(api_get("/admin/marketing/campaigns"))
    existing_keys = {c.get("campaign_key") for c in existing}
    created = 0
    for camp in CAMPAIGNS:
        if camp["key"] in existing_keys:
            print(f"  [SKIP] {camp['key']} already exists")
            continue
        valid_from = datetime.now(timezone.utc)
        valid_until = valid_from + timedelta(days=random.randint(30, 90))
        resp = api_post("/admin/marketing/campaigns", json={
            "campaign_key": camp["key"],
            "campaign_name": camp["name"],
            "channel": camp["channel"],
            "status": camp["status"],
            "campaign_type": camp["type"],
            "audience_segment": camp["audience"],
            "subject_line": camp["name"],
            "body_content": f"Check out our {camp['name']}!",
            "scheduled_at": valid_from.isoformat() if camp["status"] == "scheduled" else None,
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {camp['key']}")
        else:
            print(f"  [FAIL] {camp['key']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Campaigns: {created} created")
    return created

def seed_content_blocks():
    print_header("SEED: Content Blocks")
    existing = safe_get_items(api_get("/admin/content/blocks"))
    existing_keys = {c.get("block_key") for c in existing}
    created = 0
    for block in CONTENT_BLOCKS:
        if block["key"] in existing_keys:
            print(f"  [SKIP] {block['key']} already exists")
            continue
        resp = api_post("/admin/content/blocks", json={
            "block_key": block["key"],
            "block_name": block["name"],
            "content_type": block["type"],
            "title": block["title"],
            "body_text": block["body"],
            "display_order": block["order"],
            "is_active": block["active"],
            "store_id": 1,
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {block['key']}")
        else:
            print(f"  [FAIL] {block['key']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Content blocks: {created} created")
    return created

def seed_surveys():
    print_header("SEED: Surveys")
    existing = safe_get_items(api_get("/admin/surveys"))
    existing_keys = {s.get("survey_key") for s in existing}
    created = 0
    for survey in SURVEYS:
        if survey["key"] in existing_keys:
            print(f"  [SKIP] {survey['key']} already exists")
            continue
        resp = api_post("/admin/surveys", json={
            "survey_key": survey["key"],
            "survey_name": survey["name"],
            "description": f"Help us improve our {survey['name'].lower()}",
            "survey_type": survey["type"],
            "is_active": True,
            "questions": [
                {
                    "question_text": "How satisfied are you with our service?",
                    "question_type": "rating_scale",
                    "is_required": True,
                    "display_order": 1,
                    "min_rating": 1,
                    "max_rating": 5,
                },
                {
                    "question_text": "What can we improve?",
                    "question_type": "text_open",
                    "is_required": False,
                    "display_order": 2,
                },
            ],
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {survey['key']}")
        else:
            print(f"  [FAIL] {survey['key']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Surveys: {created} created")
    return created

def seed_vouchers():
    print_header("SEED: Vouchers")
    existing = safe_get_items(api_get("/admin/vouchers"))
    existing_codes = {v.get("voucher_code") for v in existing}
    created = 0
    vouchers = [
        {"code": "WELCOME2026", "title": "Welcome Voucher", "type": "percentage_off", "value": 10},
        {"code": "SUMMER50", "title": "Summer Special", "type": "fixed_amount_off", "value": 5.00},
        {"code": "LOYAL100", "title": "Loyalty Reward", "type": "percentage_off", "value": 15},
        {"code": "BIRTHDAY", "title": "Birthday Treat", "type": "fixed_amount_off", "value": 20.00},
    ]
    for v in vouchers:
        if v["code"] in existing_codes:
            print(f"  [SKIP] {v['code']} already exists")
            continue
        valid_from = datetime.now(timezone.utc)
        valid_until = valid_from + timedelta(days=random.randint(30, 90))
        resp = api_post("/admin/vouchers", json={
            "voucher_code": v["code"],
            "display_title": v["title"],
            "voucher_type": v["type"],
            "discount_value": v["value"],
            "valid_from": valid_from.isoformat(),
            "valid_until": valid_until.isoformat(),
            "max_global_uses": 100,
            "max_uses_per_customer": 1,
            "scope": "global",
            "is_active": True,
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {v['code']}")
        else:
            print(f"  [FAIL] {v['code']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Vouchers: {created} created")
    return created

def seed_loyalty_tiers():
    print_header("SEED: Loyalty Tiers Check")
    tiers = safe_get_items(api_get("/admin/loyalty/tiers"))
    print(f"  Existing tiers: {len(tiers)}")
    for t in tiers:
        print(f"    - {t.get('tier_key')}: {t.get('display_name')}")
    return len(tiers)

def seed_more_orders():
    print_header("SEED: Additional Orders")
    if not created_customers:
        print("  [WARN] No customers available")
        return 0

    stores = safe_get_items(api_get("/stores"))
    physical = [s for s in stores if s.get("slug") != "hq"]
    if not physical:
        print("  [WARN] No physical stores found")
        return 0

    # Use store_id 1 (HQ) for menu items - that's where they're seeded
    store_id = 1  # HQ has all menu items
    resp = api_get(f"/menu/stores/{store_id}")
    menu_data = resp.json().get("data", {}) if resp.status_code == 200 else {}
    items = menu_data.get("items", []) if isinstance(menu_data, dict) else []
    if not items:
        print("  [WARN] No menu items found")
        return 0

    created = 0
    order_types = ["dine_in", "takeaway", "delivery"]

    for i, cust in enumerate(created_customers[:15]):
        # Login as customer
        resp = api_post("/auth/login", json={"phone_number": cust["phone"]})
        if resp.status_code != 200:
            continue
        token = resp.json().get("tokens", {}).get("access_token")
        if not token:
            continue

        order_type = random.choice(order_types)

        # Add items to cart (store_id as query param)
        cart_items = random.sample(items, min(random.randint(1, 4), len(items)))
        cart_id = None
        for item in cart_items:
            cart_resp = api_post(f"/cart/items?store_id={store_id}", token=token, json={
                "menu_item_id": item["id"],
                "quantity": random.randint(1, 3),
                "unit_price": item.get("base_price", item.get("price", 10)),
            })
            if cart_resp.status_code in (200, 201):
                cart_data = cart_resp.json().get("data", {})
                if cart_data and cart_data.get("id"):
                    cart_id = cart_data["id"]

        if not cart_id:
            print(f"  [FAIL] Could not create cart for {cust['name']}")
            continue

        # Create order with cart_id
        resp = api_post("/orders", token=token, json={
            "store_id": store_id,
            "cart_id": cart_id,
            "order_type": order_type,
            "fulfillment_type": random.choice(["counter_pickup", "standard_delivery", "dine_in_service"]),
            "customer_notes": random.choice([None, "Extra hot", "Less sugar", "No ice"]),
        })
        if resp.status_code not in (200, 201):
            print(f"  [FAIL] Order for {cust['name']}: {resp.status_code} {resp.text[:80]}")
            continue

        order = resp.json().get("data", {})
        order_id = order.get("id")
        if not order_id:
            continue

        # Create payment intent for some orders
        if random.random() > 0.3:
            total = order.get("total_amount", order.get("grand_total", 0))
            if total > 0:
                api_post("/payments/intent", token=token, json={
                    "order_id": order_id,
                    "provider": random.choice(["stripe", "grabpay", "cash"]),
                    "payment_method_type": random.choice(["credit_card", "e_wallet", "cash"]),
                })

        created += 1
        print(f"  [OK] Order #{order_id} ({order_type}) for {cust['name']}")

    print(f"\n  Orders: {created} created")
    return created

def seed_notifications():
    print_header("SEED: Notifications")
    existing = safe_get_items(api_get("/admin/notifications"))
    existing_count = len(existing)
    if existing_count > 0:
        print(f"  [SKIP] {existing_count} notifications already exist")
        return 0

    created = 0
    notifications = [
        {"type": "order_update", "priority": "high", "title": "Order #1234 Ready for Pickup"},
        {"type": "promotion", "priority": "medium", "title": "Weekend 20% Off!"},
        {"type": "system", "priority": "low", "title": "System Maintenance Tonight"},
    ]
    for n in notifications:
        resp = api_post("/admin/notifications", json={
            "type": n["type"],
            "priority": n["priority"],
            "title": n["title"],
            "message": n["title"],
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {n['title']}")
        else:
            print(f"  [FAIL] {n['title']}: {resp.status_code} {resp.text[:80]}")
    print(f"\n  Notifications: {created} created")
    return created

def verify_counts():
    print_header("VERIFICATION: Data Counts")
    checks = [
        ("/admin/stores", "stores"),
        ("/admin/staff", "staff"),
        ("/admin/reservations", "reservations"),
        ("/admin/marketing/campaigns", "campaigns"),
        ("/admin/content/blocks", "content blocks"),
        ("/admin/surveys", "surveys"),
        ("/admin/vouchers", "vouchers"),
        ("/admin/loyalty/tiers", "loyalty tiers"),
        ("/admin/notifications", "notifications"),
    ]
    for path, name in checks:
        params = None
        if name == "staff":
            params = {"store_id": 1, "per_page": 100}
        resp = api_get(path, params=params)
        count = 0
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if isinstance(data, dict):
                count = len(data.get("items", []))
            elif isinstance(data, list):
                count = len(data)
        print(f"  {name}: {count}")

    # Check orders via public endpoint
    resp = api_get("/orders")
    if resp.status_code == 200:
        data = resp.json().get("data", {})
        count = len(data.get("items", [])) if isinstance(data, dict) else len(data) if isinstance(data, list) else 0
        print(f"  orders: {count}")

    print(f"  customers registered: {len(created_customers)}")

    # Check admin accounts
    resp = api_get("/admin/auth/me")
    if resp.status_code == 200:
        me = resp.json().get("data", {})
        print(f"  current admin: {me.get('email')} ({me.get('display_name')})")

def run():
    print("="*60)
    print("  FNB SUPER APP v3 — COMPREHENSIVE API SEED")
    print("  API:", API_BASE)
    print("  Admin:", ADMIN_EMAIL)
    print("="*60)

    # Health check
    resp = requests.get(f"{API_BASE}/health", timeout=5)
    if resp.status_code != 200:
        print(f"[ERROR] Backend not healthy: {resp.status_code}")
        sys.exit(1)
    print("[OK] Backend healthy")

    # Verify admin login
    tok = get_admin_token()
    print(f"[OK] Admin login successful")

    # Run all seed steps
    seed_more_customers()
    seed_reservations()
    seed_marketing_campaigns()
    seed_content_blocks()
    seed_surveys()
    seed_vouchers()
    seed_loyalty_tiers()
    seed_more_orders()
    seed_notifications()

    verify_counts()

    print_header("SEED COMPLETE")
    print("All data seeded via API only.")
    print(f"API: {API_BASE}")
    print(f"Admin Portal:  https://admin.loyaltysystem.uk")
    print(f"Staff Portal:  https://staff.loyaltysystem.uk")
    print(f"Customer PWA:  https://app.loyaltysystem.uk")
    print(f"Admin Login:   {ADMIN_EMAIL} / {ADMIN_PASS}")
    print(f"Staff Login:   staff@loyaltysystem.uk / staff123")


if __name__ == "__main__":
    run()
