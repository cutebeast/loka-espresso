#!/usr/bin/env python3
"""
FNB Super-App — API Test Data Generator

Creates test data through the API using the passwordless OTP flow:
  1. POST /auth/send-otp → phone number
  2. Backend logs the OTP code (no actual SMS)
  3. POST /auth/verify-otp → creates user if new, returns tokens
  4. All business logic (orders, loyalty, vouchers, feedback, surveys) goes through the API

Usage:
    python3 generate-test-data.py --mode full        # Full test flow
    python3 generate-test-data.py --mode customers   # Just customers
    python3 generate-test-data.py --mode orders      # Just orders
    python3 generate-test-data.py --mode loyalty    # Just loyalty
    python3 generate-test-data.py --mode vouchers   # Just vouchers
    python3 generate-test-data.py --mode surveys    # Just surveys
    python3 generate-test-data.py --mode feedback   # Just feedback
    python3 generate-test-data.py --count 10        # Number of customers
    python3 generate-test-data.py --orders 3        # Orders per customer
"""

import argparse
import os
import random
import re
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import psycopg2
import requests

# ── Config ──────────────────────────────────────────────────────────────────
API_BASE = os.environ.get("API_BASE", "https://admin.loyaltysystem.uk/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5433")
DB_NAME = os.environ.get("DB_NAME", "fnb")
DB_USER = os.environ.get("DB_USER", "fnb")
DB_PASS = os.environ.get("DB_PASS", "Tmkh6HsdsOdzBEadYhJ6rafm6Tv-qlbMpuKfYtGyaQrR_MxGq1R317ctuz6zYF1K")

# ── Colors ───────────────────────────────────────────────────────────────────
RED   = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE  = "\033[94m"
RESET = "\033[0m"

def log(msg, color=""):
    print(f"{color}[API] {msg}{RESET}")

def log_step(step):
    print(f"\n{BLUE}── {step} ──────────────────────────────{RESET}")

def log_ok(msg):
    print(f"  {GREEN}✓{RESET} {msg}")

def log_fail(msg):
    print(f"  {RED}✗{RESET} {msg}")

def log_warn(msg):
    print(f"  {YELLOW}!{RESET} {msg}")

# ── Database ────────────────────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS
    )

def get_last_otp_from_db(phone):
    """Query the database for the most recent unverified OTP for the given phone."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT code FROM otp_sessions 
            WHERE phone = %s AND verified = false 
            ORDER BY created_at DESC LIMIT 1
        """, (phone,))
        result = cur.fetchone()
        cur.close()
        conn.close()
        return result[0] if result else None
    except Exception as e:
        log_warn(f"DB OTP query failed: {e}")
        return None

# ── OTP ─────────────────────────────────────────────────────────────────────
def get_last_otp_from_log(phone):
    """Read the backend log to extract the OTP code for the given phone."""
    log_paths = [
        "/tmp/fnb-backend.log",
        "/tmp/fnb.log",
        "/root/fnb-super-app/backend.log",
    ]
    for path in log_paths:
        try:
            with open(path, "r") as f:
                content = f.read()
            # Pattern: [OTP] +6012... -> 123456
            match = re.search(rf"\[OTP\] {re.escape(phone)} -> (\d{{6}})", content)
            if match:
                return match.group(1)
        except (FileNotFoundError, PermissionError):
            pass
    return None

def send_and_get_otp(phone):
    """Send OTP via API and retrieve the code from database."""
    r = requests.post(f"{API_BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    if r.status_code != 200:
        log_fail(f"send-otp failed ({r.status_code}): {r.text[:80]}")
        return None
    # Give backend a moment to write to DB
    time.sleep(0.3)
    code = get_last_otp_from_db(phone)
    if not code:
        log_fail(f"OTP not found in DB for {phone}")
    return code

def verify_otp(phone, code):
    """Verify OTP and return token response."""
    r = requests.post(f"{API_BASE}/auth/verify-otp", json={"phone": phone, "code": code}, timeout=10)
    if r.status_code == 200:
        return r.json()
    log_fail(f"verify-otp failed ({r.status_code}): {r.text[:80]}")
    return None

def phone_login(phone):
    """Complete OTP flow: send-otp → read log → verify-otp → return tokens."""
    code = send_and_get_otp(phone)
    if not code:
        return None
    result = verify_otp(phone, code)
    if not result:
        return None
    return {
        "access_token": result["access_token"],
        "refresh_token": result.get("refresh_token"),
    }

# ── Admin Token ─────────────────────────────────────────────────────────────
def admin_token():
    r = requests.post(f"{API_BASE}/auth/login-password", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]

# ── API Helpers ─────────────────────────────────────────────────────────────
def api_get(path, token=None, params=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{API_BASE}{path}", headers=headers, params=params, timeout=10)

def api_post(path, token=None, json=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(f"{API_BASE}{path}", headers=headers, json=json, timeout=10)

def api_put(path, token=None, json=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.put(f"{API_BASE}{path}", headers=headers, json=json, timeout=10)

def api_delete(path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(f"{API_BASE}{path}", headers=headers, timeout=10)

# ── Test Data ────────────────────────────────────────────────────────────────
STORES = [1, 2, 3]

FIRST_NAMES = [
    "Ahmad", "Sarah", "Raj", "Mei", "Aida", "Wei", "Lin", "Jack",
    "Nina", "David", "Yuna", "Kai", "Luna", "Zara", "Oscar", "Emma",
    "Ben", "Sofia", "Noah", "Mia", "Ethan", "Isla", "Leo", "Chloe"
]
LAST_NAMES = [
    "Tan", "Wong", "Lee", "Kumar", "Lim", "Rahman", "Chen", "Ng",
    "Ong", "Teo", "Goh", "Yap", "Ho", "Sim", "Chua", "Ang"
]

def rand_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def rand_phone():
    return f"+6011{uuid.uuid4().hex[:7]}"

def rand_address():
    streets = ["Jalan Ampang", "Jalan Bukit Bintang", "Jalan Sultan",
                "Jalan Alor", "Jalan Cheras", "Jalan OUG"]
    return f"{random.randint(1,199)}, {random.choice(streets)}, 55000 Kuala Lumpur"

# ── Customer Creation (via OTP flow) ────────────────────────────────────────
def create_test_customer(name=None, phone=None):
    """Create customer via OTP passwordless flow. Returns customer dict or None."""
    name = name or rand_name()
    phone = phone or rand_phone()

    # Step 1: send-otp → verify-otp (auto-creates user if new)
    tokens = phone_login(phone)
    if not tokens:
        log_fail(f"OTP login failed for {phone}")
        return None

    access_token = tokens["access_token"]

    # Step 2: Register profile (set name, email)
    email = f"{name.lower().replace(' ', '.')}.{uuid.uuid4().hex[:4]}@test.my"
    r = api_post("/auth/register", token=access_token, json={
        "name": name,
        "email": email,
    })
    if r.status_code not in (200, 201):
        log_warn(f"Register profile failed ({r.status_code}): {r.text[:60]}")

    # Step 3: Get user ID from /users/me
    r2 = api_get("/users/me", token=access_token)
    if r2.status_code == 200:
        user_data = r2.json()
        user_id = user_data.get("id")
    else:
        log_fail(f"Could not get user info: {r2.status_code} - {r2.text[:60]}")
        return None

    log_ok(f"{name} (ID:{user_id}) — {phone}")
    return {
        "id": user_id,
        "phone": phone,
        "email": email,
        "name": name,
        "token": access_token,
        "orders": [],
        "feedback_id": None,
    }

# ── Cart & Orders ────────────────────────────────────────────────────────────
def get_menu_item(store_id=1):
    """Get a random menu item from a store (returns dict with id, name, base_price)."""
    r = api_get(f"/stores/{store_id}/menu")
    if r.status_code != 200:
        # Fallback: try store 1
        r = api_get("/stores/1/menu")
    if r.status_code == 200:
        data = r.json()
        # Menu is organized as {"store_id": ..., "categories": [{"items": [...]}, ...]}
        categories = data.get("categories", [])
        all_items = []
        for cat in categories:
            for item in cat.get("items", []):
                all_items.append({
                    "id": item["id"],
                    "name": item["name"],
                    "base_price": item["base_price"],
                    "store_id": store_id,
                })
        if all_items:
            return random.choice(all_items)
    return None

def add_to_cart(customer, item_id, store_id, quantity=1):
    """Add item to cart."""
    r = api_post("/cart/items", token=customer["token"], json={
        "item_id": item_id,
        "store_id": store_id,
        "quantity": quantity,
    })
    return r.status_code in (200, 201)

def place_order(customer, store_id=None, order_type=None):
    """Place order using cart. Must add items to cart first."""
    store_id = store_id or random.choice(STORES)
    order_type = order_type or random.choice(["pickup", "delivery"])

    # Get menu item
    item = get_menu_item(store_id)
    if not item:
        log_fail(f"No menu items available for store {store_id}")
        return None

    # Clear cart first
    api_delete("/cart", token=customer["token"])

    # Add item to cart
    if not add_to_cart(customer, item["id"], store_id, random.randint(1, 3)):
        log_fail(f"Failed to add item {item['id']} to cart")
        return None

    # Build order payload
    payload = {
        "store_id": store_id,
        "order_type": order_type,
    }
    if order_type == "pickup":
        payload["pickup_time"] = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    elif order_type == "delivery":
        payload["delivery_address"] = {
            "address": rand_address(),
            "lat": 3.1390,
            "lng": 101.6869,
        }

    r = api_post("/orders", token=customer["token"], json=payload)
    if r.status_code in (200, 201):
        data = r.json()
        oid = data.get("id") or data.get("order_id")
        total = data.get("total", 0)
        log_ok(f"  Order #{oid}: {order_type} @ store {store_id} — RM{total:.2f}")
        customer["orders"].append(data)
        return data
    else:
        log_fail(f"  Order failed ({r.status_code}): {r.text[:100]}")
        return None

# ── Loyalty ──────────────────────────────────────────────────────────────────
def adjust_loyalty_points(customer, points, description="Bonus"):
    """Adjust customer loyalty points (admin action)."""
    admin_tok = admin_token()
    r = api_post(f"/admin/customers/{customer['id']}/adjust-points", token=admin_tok, json={
        "points": points,
        "type": "earn" if points > 0 else "redeem",
        "description": description,
        "store_id": random.choice(STORES),
    })
    if r.status_code in (200, 201):
        log_ok(f"  {abs(points)} pts {'+' if points > 0 else '-'} → {customer['name']}: {description}")
        return r.json()
    log_fail(f"  Points failed ({r.status_code}): {r.text[:80]}")
    return None

# ── Vouchers ─────────────────────────────────────────────────────────────────
def create_voucher(discount=10.00):
    """Create a voucher (admin action)."""
    admin_tok = admin_token()
    code = f"TST-{uuid.uuid4().hex[:6].upper()}"
    r = api_post("/admin/vouchers", token=admin_tok, json={
        "code": code,
        "description": f"Test voucher {code}",
        "discount_value": discount,
        "discount_type": "fixed",
        "min_order": 0,
        "max_uses": 100,
        "valid_from": datetime.now(timezone.utc).isoformat(),
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "is_active": True,
    })
    if r.status_code in (200, 201):
        data = r.json()
        log_ok(f"  Voucher: {code} — RM{discount} off")
        return data
    log_fail(f"  Voucher failed ({r.status_code}): {r.text[:80]}")
    return None

def claim_voucher(customer, code):
    """Customer claims a voucher - NOTE: no direct claim endpoint, vouchers come from promos/surveys only."""
    log_warn(f"  Voucher claim not available via API — vouchers granted via promos/surveys only")
    return None

# ── Surveys ──────────────────────────────────────────────────────────────────
def create_survey():
    """Create a survey (admin action)."""
    admin_tok = admin_token()
    r = api_post("/admin/surveys", token=admin_tok, json={
        "title": "Customer Satisfaction Survey",
        "description": "Help us improve our service",
        "is_active": True,
        "questions": [
            {"question_text": "How was your experience?", "question_type": "rating", "is_required": True, "sort_order": 1},
            {"question_text": "Any suggestions?", "question_type": "text", "is_required": False, "sort_order": 2},
        ],
    })
    if r.status_code in (200, 201):
        data = r.json()
        log_ok(f"  Survey: {data.get('id')}")
        return data
    log_fail(f"  Survey failed ({r.status_code}): {r.text[:100]}")
    return None

def submit_survey(customer, survey_id):
    """Customer submits survey answers."""
    # First get the survey to get question IDs
    r = api_get(f"/surveys/{survey_id}", token=customer["token"])
    if r.status_code != 200:
        log_fail(f"  Get survey failed ({r.status_code})")
        return None
    survey = r.json()
    questions = survey.get("questions", [])

    answers = []
    for q in questions:
        qid = q.get("id")
        qtype = q.get("question_type", "text")
        if qtype == "rating":
            answers.append({"question_id": qid, "answer_text": str(random.randint(4, 5))})
        else:
            answers.append({"question_id": qid, "answer_text": "Great service!"})

    r2 = api_post(f"/surveys/{survey_id}/submit", token=customer["token"], json={
        "answers": answers
    })
    if r2.status_code in (200, 201):
        log_ok(f"  {customer['name']} submitted survey")
        return r2.json()
    log_fail(f"  Survey submit failed ({r2.status_code}): {r2.text[:80]}")
    return None

# ── Feedback ─────────────────────────────────────────────────────────────────
def submit_feedback(customer, rating=None):
    """Customer submits feedback."""
    rating = rating or random.randint(3, 5)
    comments = [
        "Great coffee and friendly staff!", "Quick service!",
        "Love the ambiance.", "Good place to work.",
    ]
    payload = {
        "store_id": random.choice(STORES),
        "rating": rating,
        "comment": random.choice(comments),
    }
    r = api_post("/feedback", token=customer["token"], json=payload)
    if r.status_code in (200, 201):
        data = r.json()
        fid = data.get("id")
        log_ok(f"  {customer['name']}: {rating}★ feedback #{fid}")
        customer["feedback_id"] = fid
        return data
    log_fail(f"  Feedback failed ({r.status_code}): {r.text[:80]}")
    return None

def reply_feedback(feedback_id):
    """Admin replies to feedback."""
    admin_tok = admin_token()
    replies = ["Thank you!", "We appreciate your feedback.", "Hope to see you again!"]
    r = api_post(f"/admin/feedback/{feedback_id}/reply", token=admin_tok, json={
        "admin_reply": random.choice(replies)
    })
    if r.status_code in (200, 201):
        log_ok(f"  Replied to #{feedback_id}")
        return r.json()
    log_fail(f"  Reply failed ({r.status_code}): {r.text[:80]}")
    return None

# ── Broadcasts ──────────────────────────────────────────────────────────────
def create_broadcast(title, message):
    """Create a broadcast notification (admin action)."""
    admin_tok = admin_token()
    r = api_post("/admin/broadcasts", token=admin_tok, json={
        "title": title,
        "message": message,
        "target": "all",
        "status": "draft",
    })
    if r.status_code in (200, 201):
        data = r.json()
        log_ok(f"  {title}")
        return data
    log_fail(f"  Broadcast failed ({r.status_code})")
    return None

def send_broadcast(broadcast_id):
    """Send a broadcast (admin action)."""
    admin_tok = admin_token()
    r = api_post(f"/admin/broadcasts/{broadcast_id}/send", token=admin_tok)
    if r.status_code == 200:
        log_ok(f"  Sent broadcast #{broadcast_id}")
        return r.json()
    log_fail(f"  Send failed ({r.status_code})")
    return None

# ── Loyalty Account Setup ────────────────────────────────────────────────────
def seed_loyalty_for_customer(customer):
    """Seed initial loyalty account, wallet, and welcome points via admin API."""
    admin_tok = admin_token()
    # Set initial points via adjust-points
    initial_points = random.choice([50, 100, 150, 200, 250, 300])
    r = api_post(f"/admin/customers/{customer['id']}/adjust-points", token=admin_tok, json={
        "points": initial_points,
        "type": "earn",
        "description": "Welcome bonus",
        "store_id": 1,
    })
    if r.status_code in (200, 201):
        log_ok(f"  Loyalty seeded: {initial_points} pts")
        return True
    log_warn(f"  Loyalty seed failed ({r.status_code}): {r.text[:60]}")
    return False

# ── Main Flows ────────────────────────────────────────────────────────────────
def run_full(n=5, orders_per=3):
    log_step(f"FULL TEST — {n} customers, {orders_per} orders each")

    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    log_ok("Admin auth OK")

    # 1. Create customers via OTP
    log_step("1. Customer Registration (OTP flow)")
    customers = []
    for i in range(n):
        c = create_test_customer()
        if c:
            customers.append(c)
            seed_loyalty_for_customer(c)
        time.sleep(0.3)

    if not customers:
        log_fail("No customers created")
        return
    log_ok(f"Created {len(customers)} customers")

    # 2. Orders (via cart)
    log_step(f"2. Orders ({orders_per} per customer)")
    for c in customers:
        for i in range(orders_per):
            place_order(c)
            time.sleep(0.2)

    # 3. Loyalty
    log_step("3. Loyalty Points Adjustments")
    for c in customers[:3]:
        adjust_loyalty_points(c, random.choice([20, 50, 100]), "Bonus points")

    # 4. Vouchers
    log_step("4. Voucher Claim")
    voucher = create_voucher(discount=15.00)
    if voucher:
        for c in customers[:3]:
            claim_voucher(c, voucher["code"])
            time.sleep(0.1)

    # 5. Feedback & Replies
    log_step("5. Feedback & Replies")
    for c in customers[:3]:
        fb = submit_feedback(c)
        if fb and c["feedback_id"]:
            reply_feedback(c["feedback_id"])
            time.sleep(0.1)

    # 6. Surveys
    log_step("6. Surveys")
    survey = create_survey()
    if survey:
        sid = survey.get("id")
        for c in customers[:2]:
            submit_survey(c, sid)
            time.sleep(0.1)

    # 7. Broadcasts
    log_step("7. Broadcasts")
    bc = create_broadcast("Welcome to ZUS!", "Enjoy 10% off your next order!")
    if bc:
        send_broadcast(bc.get("id"))

    # Summary
    print(f"\n{BLUE}═══════════════════════════════════════════{RESET}")
    for c in customers:
        print(f"  {c['name']:15s} | {len(c['orders'])} orders | feedback:{c['feedback_id'] or '-'}")

def run_customers(n=5):
    log_step(f"Customers — {n} registrations via OTP")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    for i in range(n):
        c = create_test_customer()
        if c:
            seed_loyalty_for_customer(c)
        time.sleep(0.3)

def run_orders(n=5, orders_per=3):
    log_step(f"Orders — {n} customers, {orders_per} orders each")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    customers = []
    for i in range(n):
        c = create_test_customer()
        if c:
            customers.append(c)
            seed_loyalty_for_customer(c)
        time.sleep(0.3)
    for c in customers:
        for i in range(orders_per):
            place_order(c)
            time.sleep(0.2)

def run_loyalty(n=5):
    log_step(f"Loyalty — {n} customers with seeded points")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    customers = []
    for i in range(n):
        c = create_test_customer()
        if c:
            customers.append(c)
            seed_loyalty_for_customer(c)
        time.sleep(0.3)
    log_step("Adjusting extra points")
    for c in customers[:3]:
        adjust_loyalty_points(c, random.choice([20, 50, 100]), "Bonus points")

def run_feedback(n=5):
    log_step(f"Feedback — {n} customers submitting feedback")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    customers = []
    for i in range(n):
        c = create_test_customer()
        if c:
            customers.append(c)
        time.sleep(0.3)
    for c in customers:
        fb = submit_feedback(c)
        if fb and c["feedback_id"]:
            reply_feedback(c["feedback_id"])
            time.sleep(0.1)

def run_surveys():
    log_step("Surveys — create and submit")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    survey = create_survey()
    if not survey:
        return
    # Create a customer to submit
    c = create_test_customer()
    if c:
        submit_survey(c, survey.get("id"))

def run_vouchers():
    log_step("Vouchers — create, claim")
    try:
        admin_token()
    except Exception as e:
        log_fail(f"Admin auth failed: {e}")
        return
    voucher = create_voucher(discount=15.00)
    if voucher:
        customers = []
        for i in range(3):
            c = create_test_customer()
            if c:
                customers.append(c)
            time.sleep(0.3)
        for c in customers:
            claim_voucher(c, voucher["code"])
            time.sleep(0.1)

# ── Entry Point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    p = argparse.ArgumentParser(description="FNB Test Data Generator")
    p.add_argument("--mode", default="full",
                   choices=["full", "customers", "orders", "loyalty", "feedback", "surveys", "vouchers"])
    p.add_argument("--count", type=int, default=5)
    p.add_argument("--orders", type=int, default=3)
    args = p.parse_args()

    try:
        if args.mode == "full":
            run_full(n=args.count, orders_per=args.orders)
        elif args.mode == "customers":
            run_customers(n=args.count)
        elif args.mode == "orders":
            run_orders(n=args.count, orders_per=args.orders)
        elif args.mode == "loyalty":
            run_loyalty(n=args.count)
        elif args.mode == "feedback":
            run_feedback(n=args.count)
        elif args.mode == "surveys":
            run_surveys()
        elif args.mode == "vouchers":
            run_vouchers()
    except requests.exceptions.ConnectionError:
        log_fail(f"Cannot connect to {API_BASE}")
        sys.exit(1)
    except Exception as e:
        log_fail(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
