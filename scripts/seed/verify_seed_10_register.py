"""
SEED SCRIPT: verify_seed_10_register.py
Purpose: Register customers via OTP API flow
APIs tested: POST /auth/send-otp, GET /admin/otps, POST /auth/verify-otp, POST /auth/register, GET /users/me, GET /admin/customers
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_09_reset_customers.py (clean customer DB required)
Flow: send-otp → verify-otp → register profile → /users/me
Idempotency: Checks API for existing customer count before registering. If >= target already exist, skips.
NO direct DB inserts — ALL via API calls.
"""

import sys, os, time, uuid, random
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import (
    API_BASE, admin_token, api_get, api_post,
    save_state, load_state, print_header,
)
import db_validate


FIRST = ["Ahmad","Sarah","Raj","Mei","Aida","Wei","Lin","Jack",
         "Nina","David","Yuna","Kai","Luna","Zara","Oscar","Emma",
         "Ben","Sofia","Noah","Mia","Ethan","Isla","Leo","Chloe",
         "Dan","Aria","Maya","Jade","Ravi","Priya","Anika","Zayn"]
LAST = ["Tan","Wong","Lee","Kumar","Lim","Rahman","Chen","Ng",
        "Ong","Teo","Goh","Yap","Ho","Sim","Chua","Ang"]
STREETS = ["Jalan Ampang", "Jalan Bukit Bintang", "Jalan Sultan",
           "Jalan Alor", "Jalan Cheras", "Jalan OUG"]


def rand_name():
    return f"{random.choice(FIRST)} {random.choice(LAST)}"

def rand_address():
    return f"{random.randint(1,199)}, {random.choice(STREETS)}, 55000 Kuala Lumpur"

def rand_phone():
    return f"+6011{random.randint(10000000, 99999999)}"

def _existing_customer_count():
    """Get customer count using GET /admin/customers API."""
    tok = admin_token()
    try:
        resp = api_get("/admin/customers?page_size=1", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("total", 0)
    except Exception:
        pass
    return 0

def get_otp_from_admin_api(phone):
    import requests
    tok = admin_token()
    try:
        resp = requests.get(
            f"{API_BASE}/admin/otps",
            params={"phone": phone},
            headers={"Authorization": f"Bearer {tok}"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json().get("code")
    except Exception:
        pass
    return None


def register_one_customer():
    import requests

    phone = rand_phone()
    name  = rand_name()
    email = f"{name.lower().replace(' ','.')}.{uuid.uuid4().hex[:6]}@test.my"

    # Step 1: send-otp
    resp = requests.post(f"{API_BASE}/auth/send-otp",
                         json={"phone": phone}, timeout=10)
    if resp.status_code != 200:
        print(f"    [FAIL] send-otp: {resp.status_code} - {resp.text[:80]}")
        return None
    send_data = resp.json()
    phone = send_data.get("phone", phone)
    session_id = send_data.get("session_id")

    # Step 2: get OTP via admin API
    time.sleep(0.2)
    otp_code = get_otp_from_admin_api(phone)
    if not otp_code:
        print(f"    [FAIL] Could not retrieve OTP for {phone}")
        return None

    # Step 3: verify-otp
    resp = requests.post(f"{API_BASE}/auth/verify-otp",
                         json={"phone": phone, "code": otp_code, "session_id": session_id}, timeout=10)
    if resp.status_code != 200:
        print(f"    [FAIL] verify-otp: {resp.status_code} - {resp.text[:80]}")
        return None
    data = resp.json()
    token = data.get("access_token")
    if not token:
        print(f"    [FAIL] No access_token in verify-otp response")
        return None

    # Step 4: register profile
    reg_resp = api_post("/auth/register", token=token,
                        json={"name": name, "email": email})
    if reg_resp.status_code not in (200, 201):
        print(f"    [FAIL] register: {reg_resp.status_code} - {reg_resp.text[:80]}")
        return None

    # Step 5: get /users/me to confirm
    me_resp = api_get("/users/me", token=token)
    if me_resp.status_code != 200:
        print(f"    [FAIL] /users/me: {me_resp.status_code}")
        return None
    user = me_resp.json()
    user_id = user.get("id")

    return {
        "user_id": user_id,
        "name": name,
        "email": email,
        "phone": phone,
        "token": token,
        "address": rand_address(),
    }


def run(n=20):
    print_header(f"STEP 10: Register {n} Customers via OTP API")
    print("API calls: POST /auth/send-otp → POST /auth/verify-otp → POST /auth/register → GET /users/me")
    print()

    # Idempotency: check API for existing customers
    existing_count = _existing_customer_count()
    if existing_count >= n:
        print(f"[SKIP] {existing_count} customers already in DB (need {n})")
        existing = load_state("customers")
        if existing:
            return existing
        print("[WARNING] Customers exist in DB but not in state file. Run verify_seed_09_reset_customers.py first.")
        return []

    started_from = existing_count
    to_register = n - existing_count
    print(f"[*] {existing_count} customers already exist, registering {to_register} more...")

    customers = load_state("customers") or []
    # Trim to only those with valid user_ids if we have some
    if customers and len(customers) > existing_count:
        customers = customers[:existing_count]

    for i in range(to_register):
        idx = started_from + i + 1
        print(f"  [{idx}/{n}] Registering...", end="", flush=True)
        c = register_one_customer()
        if c:
            customers.append(c)
            print(f" ✓ ID={c['user_id']} | {c['name']}")
        else:
            print(f" ✗ FAILED")
        time.sleep(0.5)

    db_count = _existing_customer_count()
    print(f"\n[SUMMARY] state={len(customers)} customer records, api={db_count}/{n} customers")
    save_state("customers", customers)

    # ── DB VALIDATION ────────────────────────────────────────────────
    customer_ids = [c['user_id'] for c in customers if c.get('user_id')]
    ok, count, msg = db_validate.validate_step01_registered_customers(n)
    print(f"\n[DB VALIDATION] {msg}")
    if not ok:
        raise RuntimeError(f"STEP 10 FAILED — {msg}")

    print("\n[TIER PREVIEW - after orders will change]")
    print("  (Bronze < 500 pts, Silver >= 500, Gold >= 1500, Platinum >= 3000)")
    for c in customers[:5]:
        print(f"  - {c['name']} (ID={c['user_id']})")

    return customers


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    run(n)
