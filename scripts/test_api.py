#!/usr/bin/env python3
"""
FNB Super-App — API Test Script (Unit-Test Style)

Each function is independent and can be run separately.
Run all:   python3 test_api.py
Run one:   python3 test_api.py --test otp

Tests:
  python3 test_api.py --test otp          # OTP send + verify
  python3 test_api.py --test customer     # Full customer registration flow
  python3 test_api.py --test cart        # Add to cart
  python3 test_api.py --test order       # Place order (needs cart)
  python3 test_api.py --test loyalty     # Adjust loyalty points
  python3 test_api.py --test feedback     # Submit feedback + admin reply
  python3 test_api.py --test survey      # Create survey + submit answers
  python3 test_api.py --test broadcast   # Create + send broadcast
  python3 test_api.py --test voucher     # Create voucher
  python3 test_api.py --test full        # Run all tests in sequence
"""

import argparse
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import psycopg2
import requests

# ── Config ──────────────────────────────────────────────────────────────────
API_BASE    = os.environ.get("API_BASE",    "https://admin.loyaltysystem.uk/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASS  = os.environ.get("ADMIN_PASS",  "admin123")

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5433")
DB_NAME = os.environ.get("DB_NAME", "fnb")
DB_USER = os.environ.get("DB_USER", "fnb")
DB_PASS = os.environ.get("DB_PASS", "Tmkh6HsdsOdzBEadYhJ6rafm6Tv-qlbMpuKfYtGyaQrR_MxGq1R317ctuz6zYF1K")

# ── Helpers ─────────────────────────────────────────────────────────────────
def db_conn():
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
                            user=DB_USER, password=DB_PASS)

def get_otp_from_db(phone):
    """Query DB for latest unverified OTP."""
    conn = db_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT code FROM otp_sessions
        WHERE phone = %s AND verified = false
        ORDER BY created_at DESC LIMIT 1
    """, (phone,))
    row = cur.fetchone()
    cur.close(); conn.close()
    return row[0] if row else None

def admin_token():
    r = requests.post(f"{API_BASE}/auth/login-password",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]

def api_get(path, token=None, params=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{API_BASE}{path}", headers=h, params=params, timeout=10)

def api_post(path, token=None, json=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_put(path, token=None, json=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.put(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_delete(path, token=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(f"{API_BASE}{path}", headers=h, timeout=10)

def rand_address():
    streets = ["Jalan Ampang", "Jalan Bukit Bintang", "Jalan Sultan",
               "Jalan Alor", "Jalan Cheras", "Jalan OUG"]
    return f"{random.randint(1,199)}, {random.choice(streets)}, 55000 Kuala Lumpur"

def rand_phone():
    return f"+6011{uuid.uuid4().hex[:7]}"

def rand_name():
    first = ["Ahmad","Sarah","Raj","Mei","Aida","Wei","Lin","Jack",
              "Nina","David","Yuna","Kai","Luna","Zara","Oscar","Emma",
              "Ben","Sofia","Noah","Mia","Ethan","Isla","Leo","Chloe"]
    last  = ["Tan","Wong","Lee","Kumar","Lim","Rahman","Chen","Ng",
              "Ong","Teo","Goh","Yap","Ho","Sim","Chua","Ang"]
    return f"{random.choice(first)} {random.choice(last)}"

# ── Test Results ─────────────────────────────────────────────────────────────
class Results:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
    def pass_(self, msg):
        self.passed += 1
        print(f"  ✓  {msg}")
    def fail(self, msg):
        self.failed += 1
        print(f"  ✗  {msg}")
    def skip(self, msg):
        self.skipped += 1
        print(f"  -  SKIP: {msg}")
    def summary(self):
        total = self.passed + self.failed + self.skipped
        print(f"\n{'='*60}")
        print(f"Results: {self.passed} passed, {self.failed} failed, {self.skipped} skipped (total {total})")
        return self.failed == 0

# ══════════════════════════════════════════════════════════════════════════════
# TEST: OTP Flow
# ══════════════════════════════════════════════════════════════════════════════
def test_otp(r=None):
    """Send OTP → Query DB for code → Verify OTP → Get tokens."""
    r = r or Results()
    print("\n[TEST] OTP Flow (send-otp → verify-otp)")
    phone = rand_phone()

    # Step 1: send-otp
    resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    if resp.status_code != 200:
        return r.fail(f"send-otp failed: {resp.status_code} - {resp.text[:80]}")
    r.pass_("send-otp → 200")

    time.sleep(0.4)

    # Step 2: read OTP from DB
    code = get_otp_from_db(phone)
    if not code:
        return r.fail("OTP not found in DB")
    r.pass_(f"OTP found in DB: {code}")

    # Step 3: verify-otp
    resp = requests.post(f"{API_BASE}/auth/verify-otp",
                         json={"phone": phone, "code": code}, timeout=10)
    if resp.status_code != 200:
        return r.fail(f"verify-otp failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    if "access_token" not in data:
        return r.fail("No access_token in verify-otp response")
    r.pass_(f"verify-otp → 200, user_id={data.get('sub', '?')}")
    return r, data["access_token"]


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Customer Registration
# ══════════════════════════════════════════════════════════════════════════════
def test_customer_registration(r=None):
    """Full flow: send-otp → verify-otp → register profile → get /users/me."""
    r = r or Results()
    print("\n[TEST] Customer Registration (OTP → verify → register → /users/me)")

    phone = rand_phone()
    name  = rand_name()
    email = f"{name.lower().replace(' ', '.')}.{uuid.uuid4().hex[:4]}@test.my"

    # send-otp
    resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    if resp.status_code != 200:
        return r.fail(f"send-otp failed: {resp.status_code}")
    time.sleep(0.4)

    # verify-otp
    code = get_otp_from_db(phone)
    if not code:
        return r.fail("OTP not found in DB")
    resp = requests.post(f"{API_BASE}/auth/verify-otp",
                         json={"phone": phone, "code": code}, timeout=10)
    if resp.status_code != 200:
        return r.fail(f"verify-otp failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    token = data["access_token"]
    r.pass_(f"OTP verified, token obtained")

    # register profile
    resp = api_post("/auth/register", token=token,
                    json={"name": name, "email": email})
    if resp.status_code not in (200, 201):
        return r.fail(f"register failed: {resp.status_code} - {resp.text[:80]}")
    r.pass_(f"Profile registered: {name}")

    # get user info
    resp = api_get("/users/me", token=token)
    if resp.status_code != 200:
        return r.fail(f"/users/me failed: {resp.status_code} - {resp.text[:80]}")
    user = resp.json()
    user_id = user.get("id")
    r.pass_(f"/users/me OK: id={user_id}, phone={user.get('phone')}")
    return r, token, user_id, phone


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Cart Operations
# ══════════════════════════════════════════════════════════════════════════════
def test_cart(token, user_id, r=None):
    """Add item to cart → verify cart contents → clear cart."""
    r = r or Results()
    print(f"\n[TEST] Cart Operations (user_id={user_id})")

    store_id = 1  # Use store 1

    # Get menu item
    resp = api_get(f"/stores/{store_id}/menu")
    if resp.status_code != 200:
        return r.fail(f"GET /stores/{store_id}/menu failed: {resp.status_code}")
    data = resp.json()
    categories = data.get("categories", [])
    items = [item for cat in categories for item in cat.get("items", [])]
    if not items:
        return r.fail("No menu items found")
    item = items[0]
    item_id = item["id"]
    r.pass_(f"Got menu: {item['name']} (id={item_id})")

    # Clear cart first
    resp = api_delete("/cart", token=token)
    r.pass_(f"Cart cleared: {resp.status_code}")

    # Add to cart
    resp = api_post("/cart/items", token=token, json={
        "item_id": item_id,
        "store_id": store_id,
        "quantity": 2,
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Add to cart failed: {resp.status_code} - {resp.text[:100]}")
    r.pass_(f"Added to cart: qty=2")

    # Get cart
    resp = api_get("/cart", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /cart failed: {resp.status_code}")
    cart = resp.json()
    if not cart.get("items"):
        return r.fail("Cart is empty after adding item")
    r.pass_(f"Cart verified: {len(cart['items'])} item(s), subtotal={cart.get('subtotal')}")
    return r, item, store_id


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Place Order
# ══════════════════════════════════════════════════════════════════════════════
def test_place_order_pickup(token, user_id, item, store_id, r=None):
    """Place a pickup order (cart must already have item)."""
    r = r or Results()
    print(f"\n[TEST] Place Order - Pickup (user_id={user_id})")

    # Ensure cart has item
    api_delete("/cart", token=token)
    api_post("/cart/items", token=token, json={
        "item_id": item["id"],
        "store_id": store_id,
        "quantity": random.randint(1, 3),
    })

    pickup_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    resp = api_post("/orders", token=token, json={
        "store_id": store_id,
        "order_type": "pickup",
        "pickup_time": pickup_time,
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Place order failed: {resp.status_code} - {resp.text[:120]}")
    order = resp.json()
    order_id = order.get("id")
    total = order.get("total", 0)
    r.pass_(f"Order placed: #{order_id}, total=RM{total}")
    return r, order_id


def test_place_order_delivery(token, user_id, item, store_id, r=None):
    """Place a delivery order."""
    r = r or Results()
    print(f"\n[TEST] Place Order - Delivery (user_id={user_id})")

    api_delete("/cart", token=token)
    api_post("/cart/items", token=token, json={
        "item_id": item["id"],
        "store_id": store_id,
        "quantity": 1,
    })

    resp = api_post("/orders", token=token, json={
        "store_id": store_id,
        "order_type": "delivery",
        "delivery_address": {
            "address": rand_address(),
            "lat": 3.1390,
            "lng": 101.6869,
        },
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Delivery order failed: {resp.status_code} - {resp.text[:120]}")
    order = resp.json()
    r.pass_(f"Delivery order placed: #{order.get('id')}, total=RM{order.get('total')}")
    return r, order.get("id")


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Loyalty Points
# ══════════════════════════════════════════════════════════════════════════════
def test_loyalty_adjust(user_id, points=50, description="Test bonus", r=None):
    """Admin adjusts customer loyalty points."""
    r = r or Results()
    print(f"\n[TEST] Loyalty Adjust (user_id={user_id}, pts={points})")

    tok = admin_token()
    resp = api_post(f"/admin/customers/{user_id}/adjust-points", token=tok, json={
        "points": points,
        "type": "earn",
        "description": description,
        "store_id": 1,
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Adjust points failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    r.pass_(f"Points adjusted: +{points} → {description}")
    return r


def test_loyalty_get_balance(token, r=None):
    """Customer checks their loyalty balance."""
    r = r or Results()
    print(f"\n[TEST] Loyalty Get Balance")

    resp = api_get("/loyalty/balance", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /loyalty failed: {resp.status_code} - {resp.text[:80]}")
    data = resp.json()
    r.pass_(f"Balance: {data}")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Feedback
# ══════════════════════════════════════════════════════════════════════════════
def test_feedback_submit(token, user_id, r=None):
    """Customer submits feedback."""
    r = r or Results()
    print(f"\n[TEST] Feedback Submit (user_id={user_id})")

    comments = ["Great coffee!", "Quick service", "Love the ambiance", "Good place to work"]
    rating = random.randint(3, 5)
    resp = api_post("/feedback", token=token, json={
        "store_id": random.choice([1, 2, 3]),
        "rating": rating,
        "comment": random.choice(comments),
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Submit feedback failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    feedback_id = data.get("id")
    r.pass_(f"Feedback submitted: id={feedback_id}, rating={rating}★")
    return r, feedback_id


def test_feedback_reply(feedback_id, r=None):
    """Admin replies to feedback."""
    r = r or Results()
    print(f"\n[TEST] Feedback Reply (feedback_id={feedback_id})")

    replies = ["Thank you!", "We appreciate your feedback!", "Hope to see you again!"]
    tok = admin_token()
    resp = api_post(f"/admin/feedback/{feedback_id}/reply", token=tok,
                    json={"admin_reply": random.choice(replies)})
    if resp.status_code not in (200, 201):
        return r.fail(f"Reply failed: {resp.status_code} - {resp.text[:80]}")
    r.pass_(f"Reply sent to feedback #{feedback_id}")
    return r


def test_feedback_list_admin(r=None):
    """Admin lists feedback."""
    r = r or Results()
    print(f"\n[TEST] Feedback List (Admin)")

    tok = admin_token()
    resp = api_get("/admin/feedback", token=tok)
    if resp.status_code != 200:
        return r.fail(f"List feedback failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Feedback list: {len(data)} item(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Surveys
# ══════════════════════════════════════════════════════════════════════════════
def test_survey_create(r=None):
    """Admin creates a survey with questions."""
    r = r or Results()
    print(f"\n[TEST] Survey Create (Admin)")

    tok = admin_token()
    resp = api_post("/admin/surveys", token=tok, json={
        "title": "Customer Satisfaction Survey",
        "description": "Help us improve our service",
        "is_active": True,
        "questions": [
            {"question_text": "How was your experience?",
             "question_type": "rating", "is_required": True, "sort_order": 1},
            {"question_text": "Any suggestions?",
             "question_type": "text", "is_required": False, "sort_order": 2},
        ],
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Create survey failed: {resp.status_code} - {resp.text[:120]}")
    data = resp.json()
    survey_id = data.get("id")
    r.pass_(f"Survey created: id={survey_id}, questions={len(data.get('questions', []))}")
    return r, survey_id


def test_survey_submit(token, survey_id, r=None):
    """Customer submits survey answers."""
    r = r or Results()
    print(f"\n[TEST] Survey Submit (survey_id={survey_id})")

    # Get survey questions
    resp = api_get(f"/surveys/{survey_id}")
    if resp.status_code != 200:
        return r.fail(f"GET /surveys/{survey_id} failed: {resp.status_code}")
    survey = resp.json()
    questions = survey.get("questions", [])
    if not questions:
        return r.fail("Survey has no questions")

    answers = []
    for q in questions:
        qtype = q.get("question_type", "text")
        if qtype == "rating":
            answers.append({"question_id": q["id"], "answer_text": "5"})
        else:
            answers.append({"question_id": q["id"], "answer_text": "Great service!"})

    resp = api_post(f"/surveys/{survey_id}/submit", token=token, json={"answers": answers})
    if resp.status_code not in (200, 201):
        return r.fail(f"Submit survey failed: {resp.status_code} - {resp.text[:120]}")
    data = resp.json()
    r.pass_(f"Survey submitted: response_id={data.get('response_id')}, voucher_granted={data.get('voucher_granted')}")
    return r


def test_survey_list_admin(r=None):
    """Admin lists surveys."""
    r = r or Results()
    print(f"\n[TEST] Survey List (Admin)")

    tok = admin_token()
    resp = api_get("/admin/surveys", token=tok)
    if resp.status_code != 200:
        return r.fail(f"List surveys failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Survey list: {len(data)} survey(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Voucher
# ══════════════════════════════════════════════════════════════════════════════
def test_voucher_claim_promo(token, r=None):
    """Customer claims voucher from promo_banner."""
    r = r or Results()
    print(f"\n[TEST] Voucher Claim from Promo Banner")

    # Get available promo banners
    resp = api_get("/promos/banners", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /promos/banners failed: {resp.status_code}")
    banners = resp.json()
    if not banners:
        return r.skip("No promo banners available")

    # Claim first banner with action_type=detail
    detail_banners = [b for b in banners if b.get("action_type") == "detail"]
    if not detail_banners:
        return r.skip("No detail-type promo banners")

    banner = detail_banners[0]
    banner_id = banner["id"]

    resp = api_post(f"/promos/banners/{banner_id}/claim", token=token)
    if resp.status_code not in (200, 201):
        return r.fail(f"Claim promo failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    r.pass_(f"Claimed promo banner #{banner_id}: {data}")
    return r


def test_voucher_list_admin(r=None):
    """Admin lists vouchers."""
    r = r or Results()
    print(f"\n[TEST] Voucher List (Admin)")

    tok = admin_token()
    resp = api_get("/admin/vouchers", token=tok)
    if resp.status_code != 200:
        return r.fail(f"List vouchers failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Voucher list: {len(data)} voucher(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Broadcast
# ══════════════════════════════════════════════════════════════════════════════
def test_broadcast_create_and_send(r=None):
    """Admin creates a broadcast (draft) then sends it."""
    r = r or Results()
    print(f"\n[TEST] Broadcast Create + Send (Admin)")

    tok = admin_token()
    title = f"Test Broadcast {uuid.uuid4().hex[:6]}"
    resp = api_post("/admin/broadcasts", token=tok, json={
        "title": title,
        "message": "Enjoy 10% off your next order!",
        "target": "all",
        "status": "draft",
    })
    if resp.status_code not in (200, 201):
        return r.fail(f"Create broadcast failed: {resp.status_code} - {resp.text[:100]}")
    data = resp.json()
    bc_id = data.get("id")
    r.pass_(f"Broadcast created: id={bc_id}, status={data.get('status')}")

    # Send it
    resp = api_post(f"/admin/broadcasts/{bc_id}/send", token=tok)
    if resp.status_code != 200:
        return r.fail(f"Send broadcast failed: {resp.status_code} - {resp.text[:100]}")
    r.pass_(f"Broadcast sent: id={bc_id}")
    return r


def test_broadcast_list_admin(r=None):
    """Admin lists broadcasts."""
    r = r or Results()
    print(f"\n[TEST] Broadcast List (Admin)")

    tok = admin_token()
    resp = api_get("/admin/broadcasts", token=tok)
    if resp.status_code != 200:
        return r.fail(f"List broadcasts failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Broadcast list: {len(data)} broadcast(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Health / API Info
# ══════════════════════════════════════════════════════════════════════════════
def test_api_health(r=None):
    """Check API health and version."""
    r = r or Results()
    print(f"\n[TEST] API Health")

    resp = requests.get(f"{API_BASE}/", timeout=10)
    r.pass_(f"API root: {resp.status_code}")

    resp = api_get("/admin", token=admin_token())
    if resp.status_code == 200:
        data = resp.json()
        r.pass_(f"Admin endpoint OK: {data}")
    else:
        r.fail(f"Admin endpoint: {resp.status_code}")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Menu
# ══════════════════════════════════════════════════════════════════════════════
def test_menu(store_id=1, r=None):
    """Get store menu."""
    r = r or Results()
    print(f"\n[TEST] Menu (store_id={store_id})")

    resp = api_get(f"/stores/{store_id}/menu")
    if resp.status_code != 200:
        return r.fail(f"GET /stores/{store_id}/menu failed: {resp.status_code}")
    data = resp.json()
    categories = data.get("categories", [])
    item_count = sum(len(cat.get("items", [])) for cat in categories)
    r.pass_(f"Menu OK: {len(categories)} categories, {item_count} items")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Orders List
# ══════════════════════════════════════════════════════════════════════════════
def test_orders_list(token, r=None):
    """Customer lists their orders."""
    r = r or Results()
    print(f"\n[TEST] Orders List")

    resp = api_get("/orders", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /orders failed: {resp.status_code}")
    data = resp.json()
    orders = data.get("orders", []) if isinstance(data, dict) else data
    r.pass_(f"Orders list: {len(orders)} order(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Wallet
# ══════════════════════════════════════════════════════════════════════════════
def test_wallet_get(token, r=None):
    """Customer gets wallet info."""
    r = r or Results()
    print(f"\n[TEST] Wallet Get")

    resp = api_get("/wallet", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /wallet failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Wallet: {data}")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# TEST: Notifications
# ══════════════════════════════════════════════════════════════════════════════
def test_notifications_list(token, r=None):
    """Customer lists notifications."""
    r = r or Results()
    print(f"\n[TEST] Notifications List")

    resp = api_get("/notifications", token=token)
    if resp.status_code != 200:
        return r.fail(f"GET /notifications failed: {resp.status_code}")
    data = resp.json()
    r.pass_(f"Notifications: {len(data)} item(s)")
    return r


# ══════════════════════════════════════════════════════════════════════════════
# FULL INTEGRATION TEST
# ══════════════════════════════════════════════════════════════════════════════
def run_full_integration():
    """Run a complete customer journey through all endpoints."""
    r = Results()
    print("\n" + "="*60)
    print("FULL INTEGRATION TEST")
    print("="*60)

    # 1. Customer registration
    res = test_customer_registration(r)
    if len(res) < 4:
        return r
    _, token, user_id, phone = res

    # 2. Loyalty check
    test_loyalty_get_balance(token, r)

    # 3. Cart + Order (pickup)
    res = test_cart(token, user_id, r)
    if len(res) >= 3:
        _, item, store_id = res
        test_place_order_pickup(token, user_id, item, store_id, r)
        test_place_order_delivery(token, user_id, item, store_id, r)

    # 4. Orders list
    test_orders_list(token, r)

    # 5. Loyalty adjust
    test_loyalty_adjust(user_id, 100, "Integration test bonus", r)
    test_loyalty_get_balance(token, r)

    # 6. Feedback
    res = test_feedback_submit(token, user_id, r)
    if len(res) >= 2:
        _, feedback_id = res
        test_feedback_reply(feedback_id, r)
    test_feedback_list_admin(r)

    # 7. Survey
    res = test_survey_create(r)
    if len(res) >= 2:
        _, survey_id = res
        test_survey_submit(token, survey_id, r)
    test_survey_list_admin(r)

    # 8. Voucher (claim from promo banner)
    res = test_customer_registration(r)
    if len(res) >= 3:
        _, cust_token, cust_user_id, _ = res
        test_voucher_claim_promo(cust_token, r)
    test_voucher_list_admin(r)

    # 9. Broadcast
    test_broadcast_create_and_send(r)
    test_broadcast_list_admin(r)

    # 10. Wallet & Notifications
    test_wallet_get(token, r)
    test_notifications_list(token, r)

    return r


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

# DATA: Cleanup & Seed  (defined outside if __name__ so they can be imported)
# ══════════════════════════════════════════════════════════════════════════════
def cleanup_test_data():
    """Delete all test customers (ID >= 76) and their child records.
    Handles ALL foreign key constraints in correct order."""
    print(f"\n[CLEANUP] Removing test customers (ID >= 76) and all child records...")
    test_ids = list(range(76, 999))

    def delete(table, col):
        conn = db_conn()
        cur = conn.cursor()
        placeholders = ','.join(['%s'] * len(test_ids))
        cur.execute(f"DELETE FROM {table} WHERE {col} IN ({placeholders})", test_ids)
        conn.commit()
        deleted = cur.rowcount
        cur.close(); conn.close()
        return deleted

    # Order-dependent tables (FK chain: order_items, order_status_history -> orders)
    delete('order_status_history', 'order_id')
    delete('order_items', 'order_id')
    deleted = delete('orders', 'user_id')
    print(f"  orders: {deleted}")

    # User-owned child records (in dependency order)
    for table, col in [
        ('cart_items',            'user_id'),
        ('loyalty_transactions', 'user_id'),
        ('wallet_transactions',   'user_id'),
        ('notifications',         'user_id'),
        ('loyalty_accounts',     'user_id'),
        ('wallets',              'user_id'),
        ('feedback',             'user_id'),
        ('survey_responses',    'user_id'),
        ('user_vouchers',       'user_id'),
        ('device_tokens',        'user_id'),
        ('user_addresses',       'user_id'),
        ('token_blacklist',      'user_id'),
        ('favorites',            'user_id'),
        ('payment_methods',      'user_id'),
        ('user_rewards',        'user_id'),
        ('user_store_access',    'user_id'),
        ('audit_log',           'user_id'),
    ]:
        try:
            d = delete(table, col)
            if d > 0:
                print(f"  {table}: {d}")
        except Exception as e:
            print(f"  {table}: ERROR {e}")

    # Referrals
    try:
        conn = db_conn()
        cur = conn.cursor()
        ph = ','.join(['%s']*len(test_ids))
        cur.execute(f"DELETE FROM referrals WHERE referrer_id IN ({ph}) OR invitee_id IN ({ph})", test_ids*2)
        conn.commit()
        print(f"  referrals: {cur.rowcount}")
        cur.close(); conn.close()
    except Exception as e:
        print(f"  referrals: ERROR {e}")

    # Staff
    try:
        d = delete('staff', 'user_id')
        if d > 0:
            print(f"  staff: {d}")
    except: pass

    # Users (must be last — all children must be gone)
    try:
        deleted = delete('users', 'id')
        print(f"  users: {deleted}")
    except Exception as e:
        print(f"  users: ERROR {e}")

    print(f"[Cleanup complete]")


def seed_customers(n=10):
    """Create N customers via OTP flow, each with loyalty, order, feedback."""
    print(f"\n[SEED] Creating {n} customers with full journey...")
    created = []
    for i in range(n):
        c = _seed_one_customer()
        if c:
            created.append(c)
        time.sleep(0.2)
    print(f"\n{'='*50}")
    print(f"SEED: {len(created)}/{n} customers created")
    for c in created:
        print(f"  ID={c['id']:3d} | {c['name']:15s} | pts={c.get('pts', 0):4d} | fb={c.get('fb', '-')}")


def _seed_one_customer():
    """OTP → register → order (pending→completed) → feedback. Returns dict or None.
    Loyalty points are earned ONLY when orders transition to completed."""
    try:
        phone = rand_phone()
        name  = rand_name()
        email = f"{name.lower().replace(' ','.')}.{uuid.uuid4().hex[:4]}@test.my"

        # OTP
        resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
        if resp.status_code != 200:
            return None
        time.sleep(0.3)
        code = get_otp_from_db(phone)
        if not code:
            return None

        resp = requests.post(f"{API_BASE}/auth/verify-otp",
                            json={"phone": phone, "code": code}, timeout=10)
        if resp.status_code != 200:
            return None
        token = resp.json()["access_token"]

        # Register
        api_post("/auth/register", token=token, json={"name": name, "email": email})

        resp = api_get("/users/me", token=token)
        if resp.status_code != 200:
            return None
        user_id = resp.json()["id"]

        # Place 1-3 orders via API (orders start as 'pending')
        completed_orders = []
        for _ in range(random.randint(1, 3)):
            store_id = random.choice([1, 2, 3])
            resp = api_get(f"/stores/{store_id}/menu")
            if resp.status_code == 200:
                items = [item for cat in resp.json().get("categories", [])
                             for item in cat.get("items", [])]
                if not items:
                    continue
                item = random.choice(items)
                api_delete("/cart", token=token)
                api_post("/cart/items", token=token, json={
                    "item_id": item["id"], "store_id": store_id,
                    "quantity": random.randint(1, 3)})
                otype = random.choice(["pickup", "delivery"])
                payload = {"store_id": store_id, "order_type": otype}
                if otype == "pickup":
                    payload["pickup_time"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
                elif otype == "delivery":
                    payload["delivery_address"] = {"address": rand_address(), "lat": 3.1390, "lng": 101.6869}
                resp = api_post("/orders", token=token, json=payload)
                if resp.status_code in (200, 201):
                    order_id = resp.json().get("id")
                    # Transition order to 'completed' via admin API — this awards loyalty points
                    admin_tok = admin_token()
                    api_put(f"/orders/{order_id}/status", token=admin_tok,
                            json={"status": "completed", "note": "Order fulfilled"})
                    completed_orders.append(order_id)

        # Feedback
        fb_id = None
        fb = api_post("/feedback", token=token, json={
            "store_id": random.choice([1, 2, 3]),
            "rating": random.randint(3, 5),
            "comment": random.choice(["Great service!", "Fast delivery", "Love the coffee"]),
        })
        if fb.status_code in (200, 201):
            fb_id = fb.json().get("id")
            api_post(f"/admin/feedback/{fb_id}/reply", token=admin_token(),
                    json={"admin_reply": "Thank you for your feedback!"})

        # Get final points balance
        pts = 0
        bal_resp = api_get("/loyalty/balance", token=token)
        if bal_resp.status_code == 200:
            pts = bal_resp.json().get("points_balance", 0)

        print(f"  [{name}] ID={user_id}, orders={completed_orders}, pts={pts}, fb={fb_id}")
        return {"id": user_id, "name": name, "pts": pts, "fb": fb_id,
                "orders": completed_orders}

    except Exception as e:
        print(f"  ERROR: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════

# DATA: Cleanup & Seed
# ══════════════════════════════════════════════════════════════════════════════
def cleanup_test_data(r=None):
    """Delete all test customers (IDs from previous runs) and their child records.
    Handles ALL foreign key constraints in correct order."""
    r = r or Results()
    print(f"\n[CLEANUP] Removing test customers (ID >= 76) and all child records...")

    test_ids = list(range(76, 999))
    ph = ','.join(['%s'] * len(test_ids))

    def delete(table, col, values=None):
        vals = values or test_ids
        conn = db_conn()
        cur = conn.cursor()
        p = ','.join(['%s'] * len(vals))
        cur.execute(f"DELETE FROM {table} WHERE {col} IN ({p})", vals)
        conn.commit()
        deleted = cur.rowcount
        cur.close(); conn.close()
        return deleted

    # Step 1: Get order IDs for test users (needed for child table FKs)
    conn = db_conn()
    cur = conn.cursor()
    cur.execute(f"SELECT id FROM orders WHERE user_id IN ({ph})", test_ids)
    order_ids = [row[0] for row in cur.fetchall()]
    cur.close(); conn.close()

    if order_ids:
        order_ph = ','.join(['%s'] * len(order_ids))
        # Delete order-items and order-status-history referencing these orders
        def delete_by_order_ids(table, col):
            if not order_ids:
                return 0
            conn = db_conn()
            cur = conn.cursor()
            p = ','.join(['%s'] * len(order_ids))
            cur.execute(f"DELETE FROM {table} WHERE {col} IN ({p})", order_ids)
            conn.commit()
            deleted = cur.rowcount
            cur.close(); conn.close()
            return deleted

        n = delete_by_order_ids('order_status_history', 'order_id')
        r.pass_(f"  order_status_history: {n} deleted")
        n = delete_by_order_ids('order_items', 'order_id')
        r.pass_(f"  order_items: {n} deleted")

    # Step 2: Nullify order_id in loyalty_transactions (breaks FK to orders)
    try:
        conn = db_conn()
        cur = conn.cursor()
        cur.execute(f"UPDATE loyalty_transactions SET order_id = NULL WHERE user_id IN ({ph})", test_ids)
        conn.commit()
        r.pass_(f"  loyalty_transactions: {cur.rowcount} order_ids nullified")
        cur.close(); conn.close()
    except Exception as e:
        r.fail(f"  loyalty_transactions nullify: {e}")

    # Step 3: Delete orders by user_id
    deleted = delete('orders', 'user_id')
    r.pass_(f"  orders: {deleted} deleted")

    # Step 4: Delete user-owned child records
    for table, col in [
        ('cart_items',           'user_id'),
        ('loyalty_transactions', 'user_id'),
        ('wallet_transactions',  'user_id'),
        ('notifications',        'user_id'),
        ('loyalty_accounts',     'user_id'),
        ('wallets',              'user_id'),
        ('feedback',             'user_id'),
        ('survey_responses',     'user_id'),
        ('user_vouchers',        'user_id'),
        ('device_tokens',        'user_id'),
        ('user_addresses',       'user_id'),
        ('token_blacklist',      'user_id'),
        ('favorites',             'user_id'),
        ('payment_methods',      'user_id'),
        ('user_rewards',         'user_id'),
        ('user_store_access',    'user_id'),
        ('audit_log',            'user_id'),
    ]:
        try:
            deleted = delete(table, col)
            if deleted > 0:
                r.pass_(f"  {table}: {deleted} deleted")
        except Exception as e:
            r.fail(f"  {table}: {e}")

    # Referrals
    try:
        conn = db_conn()
        cur = conn.cursor()
        cur.execute(f"DELETE FROM referrals WHERE referrer_id IN ({ph}) OR invitee_id IN ({ph})", test_ids * 2)
        conn.commit()
        r.pass_(f"  referrals: {cur.rowcount} deleted")
        cur.close(); conn.close()
    except Exception as e:
        r.fail(f"  referrals: {e}")

    # Users (last — all children must be gone)
    try:
        deleted = delete('users', 'id')
        r.pass_(f"  users: {deleted} deleted")
    except Exception as e:
        r.fail(f"  users: {e}")

    return r


def seed_customers(n=10, orders_per=3, seed_loyalty=True, seed_wallet=True):
    """Create N customers via OTP, each with cart+order, loyalty, feedback."""
    r = Results()
    print(f"\n[SEED] Creating {n} customers with orders and loyalty...")

    created = []
    for i in range(n):
        print(f"\n  [{i+1}/{n}] Creating customer...")
        res = _customer_with_full_journey(r, orders_per)
        if res:
            created.append(res)
        time.sleep(0.2)

    print(f"\n{'='*50}")
    print(f"SEED SUMMARY: {len(created)} customers created")
    for c in created:
        print(f"  ID={c['id']:3d} | {c['name']:15s} | "
              f"orders={len(c['orders']):2d} | pts={c.get('points', 0):4d} | "
              f"feedback={c.get('feedback_id', '-')}")
    return r


def _customer_with_full_journey(r, orders_per=3):
    """Create one customer: OTP → register → cart → order (pending→completed) → feedback.
    Loyalty points are earned ONLY when orders transition to completed."""
    try:
        phone = rand_phone()
        name  = rand_name()
        email = f"{name.lower().replace(' ','.')}.{uuid.uuid4().hex[:4]}@test.my"

        # OTP flow
        resp = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
        if resp.status_code != 200:
            r.fail(f"send-otp failed: {resp.status_code}")
            return None
        time.sleep(0.3)

        code = get_otp_from_db(phone)
        if not code:
            r.fail("OTP not in DB")
            return None

        resp = requests.post(f"{API_BASE}/auth/verify-otp",
                            json={"phone": phone, "code": code}, timeout=10)
        if resp.status_code != 200:
            r.fail(f"verify-otp failed: {resp.status_code}")
            return None
        token = resp.json()["access_token"]

        # Register
        api_post("/auth/register", token=token, json={"name": name, "email": email})

        resp = api_get("/users/me", token=token)
        if resp.status_code != 200:
            r.fail(f"/users/me failed: {resp.status_code}")
            return None
        user_id = resp.json()["id"]
        r.pass_(f"  ✓ {name} (ID={user_id}, {phone})")

        # Cart + Order — place orders and transition to completed via API
        # Loyalty points are awarded ONLY at completed status (not at placement)
        completed_order_ids = []
        for _ in range(random.randint(1, orders_per)):
            store_id = random.choice([1, 2, 3])
            resp = api_get(f"/stores/{store_id}/menu")
            if resp.status_code == 200:
                data = resp.json()
                items = [item for cat in data.get("categories", [])
                              for item in cat.get("items", [])]
                if items:
                    item = random.choice(items)
                    api_delete("/cart", token=token)
                    api_post("/cart/items", token=token, json={
                        "item_id": item["id"], "store_id": store_id,
                        "quantity": random.randint(1, 3)})
                    otype = random.choice(["pickup", "delivery"])
                    payload = {"store_id": store_id, "order_type": otype}
                    if otype == "pickup":
                        payload["pickup_time"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
                    elif otype == "delivery":
                        payload["delivery_address"] = {"address": rand_address(), "lat": 3.1390, "lng": 101.6869}
                    resp = api_post("/orders", token=token, json=payload)
                    if resp.status_code in (200, 201):
                        order_id = resp.json().get("id")
                        # Transition to completed — this is what triggers loyalty point award
                        admin_tok = admin_token()
                        api_put(f"/orders/{order_id}/status", token=admin_tok,
                                json={"status": "completed", "note": "Order fulfilled"})
                        completed_order_ids.append(order_id)

        # Feedback
        feedback_id = None
        fb_resp = api_post("/feedback", token=token, json={
            "store_id": random.choice([1, 2, 3]),
            "rating": random.randint(3, 5),
            "comment": random.choice(["Great service!", "Fast delivery", "Love the coffee"]),
        })
        if fb_resp.status_code in (200, 201):
            feedback_id = fb_resp.json().get("id")
            api_post(f"/admin/feedback/{feedback_id}/reply", token=admin_token(),
                    json={"admin_reply": "Thank you for your feedback!"})

        # Get final points
        pts = 0
        bal_resp = api_get("/loyalty/balance", token=token)
        if bal_resp.status_code == 200:
            pts = bal_resp.json().get("points_balance", 0)

        return {"id": user_id, "name": name, "token": token,
                "phone": phone, "orders": completed_order_ids, "points": pts,
                "feedback_id": feedback_id}

    except Exception as e:
        print(f"  ERROR: {e}")
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FNB API Test Script")
    parser.add_argument("--test", default="all",
                        choices=["all","otp","customer","cart","order","loyalty",
                                 "feedback","survey","voucher","broadcast","health","menu",
                                 "cleanup","seed"])
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"FNB API Test Script — mode: {args.test}")
    print(f"{'='*60}")

    try:
        if args.test == "all":
            r = run_full_integration()

        elif args.test == "otp":
            r = Results()
            test_otp(r)

        elif args.test == "customer":
            r = Results()
            test_customer_registration(r)

        elif args.test == "cart":
            r = Results()
            # Need a token first
            res = test_customer_registration(r)
            if len(res) >= 3:
                _, token, user_id, _ = res
                test_cart(token, user_id, r)

        elif args.test == "order":
            r = Results()
            res = test_customer_registration(r)
            if len(res) >= 3:
                _, token, user_id, _ = res
                res = test_cart(token, user_id, r)
                if len(res) >= 3:
                    _, item, store_id = res
                    test_place_order_pickup(token, user_id, item, store_id, r)

        elif args.test == "loyalty":
            r = Results()
            res = test_customer_registration(r)
            if len(res) >= 3:
                _, token, user_id, _ = res
                test_loyalty_adjust(user_id, 100, "Test bonus", r)
                test_loyalty_get_balance(token, r)

        elif args.test == "feedback":
            r = Results()
            res = test_customer_registration(r)
            if len(res) >= 3:
                _, token, user_id, _ = res
                res = test_feedback_submit(token, user_id, r)
                if len(res) >= 2:
                    _, fid = res
                    test_feedback_reply(fid, r)
                test_feedback_list_admin(r)

        elif args.test == "survey":
            r = Results()
            res = test_customer_registration(r)
            res2 = test_survey_create(r)
            if len(res) >= 2 and len(res2) >= 2:
                test_survey_submit(res[1], res2[1], r)

        elif args.test == "voucher":
            r = Results()
            res = test_customer_registration(r)
            if len(res) >= 3:
                test_voucher_claim_promo(res[1], r)
            test_voucher_list_admin(r)

        elif args.test == "broadcast":
            r = Results()
            test_broadcast_create_and_send(r)
            test_broadcast_list_admin(r)

        elif args.test == "health":
            r = Results()
            test_api_health(r)

        elif args.test == "menu":
            r = Results()
            test_menu(1, r)
            test_menu(2, r)

        elif args.test == "cleanup":
            cleanup_test_data()

        elif args.test == "seed":
            n = int(os.environ.get("SEED_COUNT", "10"))
            seed_customers(n)

        print()

    except Exception as e:
        print(f"\n✗  Unexpected error in test runner: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════