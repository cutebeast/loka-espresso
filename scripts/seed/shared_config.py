"""
Shared configuration for all seed scripts.
NO direct DB access - all data flows through API calls only.
Last updated: 2026-04-21 | Pre-integration sync with current auth/payment/delivery flow

IMPORTANT: Order of execution for customer seeding:
00-09: Base system seeds (stores, menu, inventory, staff, config, rewards, vouchers, promotions)
10: Register 50 customers via OTP
11: Wallet topup (RM 100-500, multiples of 50)
12a: Place PICKUP orders
12b: Place DELIVERY orders (requires 3rdparty_delivery/mock_delivery_server.py)
12c: Place DINE-IN orders (tests QR scan and table assignment)
13: Order Completion Orchestrator (routes to Flow A or B based on order type)
    ├─ Flow A (Pickup/Delivery): Checkout → Apply Voucher → Pay → Fulfill → Complete
    └─ Flow B (Dine-in):        Confirm → Fulfill → Checkout → Apply Voucher → Pay → Complete

Flow A (Pickup/Delivery):  pending → paid → confirmed → preparing → ready → completed
                           (delivery adds: out_for_delivery)
Flow B (Dine-in):          pending → [apply voucher] → confirmed → preparing → ready → paid → completed
                           (voucher applied while pending; payment at END of meal)

APIs Used by Flow Scripts:
  - GET /orders (fetch pending orders)
  - GET /vouchers/me (get available vouchers)
  - POST /orders/{id}/apply-voucher (apply discount)
  - POST /orders/{id}/confirm (dine-in confirmation)
  - PATCH /orders/{id}/status (status transitions)
  - POST /tables/{id}/release (release table after dine-in)
  - POST /payments/create-intent (wallet payment intent)
  - POST /payments/confirm (wallet payment settlement)
  - POST /wallet/webhook/pg-payment (mock PG wallet topup callback)
  - POST /wallet/webhook/order-payment (mock PG order-payment callback)
"""
import os

API_BASE    = os.environ.get("API_BASE",    "http://localhost:3002/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "")
if not ADMIN_PASS:
    raise RuntimeError("ADMIN_PASS environment variable must be set. Do not use default passwords.")

# ── Admin token cache ──────────────────────────────────────────────
# Caches the admin token for the lifetime of the process to avoid
# flooding the rate limiter with login-password calls.
_admin_token_cache = {"token": None, "expires_at": 0}

# Data directory for inter-script state
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

# Store IDs available in the system (physical stores, not HQ)
# After init-hq (id=0) + 5 physical stores via POST /admin/stores, IDs are 1-5
STORE_IDS = [1, 2, 3, 4, 5]

# ── Date Generation Helpers ───────────────────────────────────────
# For spreading orders over a date range (e.g., 60 days)
import random
from datetime import datetime, timezone, timedelta

def rand_date_within_days(days_back=60, hours_forward=4):
    """
    Generate a random datetime within the last N days.
    Used to spread order data over a historical period.

    Args:
        days_back: How many days back to go (default: 60)
        hours_forward: Hours to add for pickup/delivery time (default: 4)

    Returns:
        datetime with timezone info
    """
    now = datetime.now(timezone.utc)
    # Random date within the last 'days_back' days
    random_days = random.randint(0, days_back)
    random_hours = random.randint(0, 23)
    random_minutes = random.randint(0, 59)

    base_time = now - timedelta(days=random_days, hours=random_hours, minutes=random_minutes)
    # Add forward hours for pickup/delivery time
    return base_time + timedelta(hours=random.randint(1, hours_forward))

def rand_past_date(days_back=60):
    """Generate a random date in the past within specified days."""
    now = datetime.now(timezone.utc)
    random_days = random.randint(0, days_back)
    random_hours = random.randint(0, 23)
    return now - timedelta(days=random_days, hours=random_hours)

def admin_token():
    """Get admin access token via API (cached for this process).
    On 429 rate limit, waits and retries once."""
    import time, requests
    now = time.time()
    if _admin_token_cache["token"] and now < _admin_token_cache.get("expires_at", 0):
        return _admin_token_cache["token"]
    resp = requests.post(f"{API_BASE}/auth/login-password",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=10)
    if resp.status_code == 429:
        # Rate limited — wait 10s and retry once
        time.sleep(10)
        resp = requests.post(f"{API_BASE}/auth/login-password",
                            json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=10)
    resp.raise_for_status()
    tok = resp.json()["access_token"]
    _admin_token_cache["token"] = tok
    _admin_token_cache["expires_at"] = now + 1800
    return tok

def invalidate_admin_token():
    """Clear admin token cache (useful if we get 401 and need to force re-login)."""
    _admin_token_cache["token"] = None
    _admin_token_cache["expires_at"] = 0

def api_get(path, token=None, params=None):
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{API_BASE}{path}", headers=h, params=params, timeout=10)

def api_post(path, token=None, json=None):
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_put(path, token=None, json=None):
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.put(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def api_delete(path, token=None):
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(f"{API_BASE}{path}", headers=h, timeout=10)

def api_patch(path, token=None, json=None):
    """HTTP PATCH - required for /orders/{id}/status endpoint."""
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.patch(f"{API_BASE}{path}", headers=h, json=json, timeout=10)

def save_state(key, data):
    """Save script state to JSON file for inter-script communication."""
    import json, os
    state = {}
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            state = json.load(f)
    if key is None:
        if not isinstance(data, dict):
            raise ValueError("save_state(None, data) requires data to be a dict")
        state = data
    else:
        state[key] = data
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)

def load_state(key=None):
    """Load script state from JSON file."""
    import json, os
    if not os.path.exists(STATE_FILE):
        return None if key is not None else {}
    with open(STATE_FILE) as f:
        state = json.load(f)
    if key is None:
        return state
    return state.get(key)


def get_store_menu_items(store_id, token, available_only=True):
    """Fetch flat menu items using the PWA-style items endpoint."""
    import requests
    params = {}
    if available_only:
        params["available_only"] = "true"
    resp = requests.get(
        f"{API_BASE}/menu/items",
        headers={"Authorization": f"Bearer {token}"} if token else {},
        params=params,
        timeout=10,
    )
    if resp.status_code != 200:
        return [], f"GET /menu/items failed: {resp.status_code}"

    items = []
    for item in resp.json():
        if available_only and not item.get("is_available", True):
            continue
        items.append(
            {
                "item_id": item["id"],
                "name": item["name"],
                "base_price": item.get("base_price", 0),
            }
        )
    return items, None

def print_header(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")


# ── Customer re-authentication ──────────────────────────────────────
# Used when a stored JWT token becomes invalid (e.g., after DB reset).

def get_otp_from_admin_api(phone):
    """Read OTP via admin API endpoint. Returns code string or None."""
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


def re_auth_customer(customer):
    """Re-authenticate a customer via OTP using stored phone number.
    Returns (updated_customer, new_token) on success, or (original_customer, None) on failure.
    Use this when a stored JWT returns 401 — the customer record still exists
    in the DB but the JWT is invalid (e.g., after DB reset)."""
    import time, requests
    phone = customer.get("phone")
    if not phone:
        return customer, None

    # Step 1: send-otp
    r1 = requests.post(f"{API_BASE}/auth/send-otp",
                       json={"phone": phone}, timeout=10)
    if r1.status_code != 200:
        return customer, None
    send_data = r1.json()
    normalized_phone = send_data.get("phone", phone)
    session_id = send_data.get("session_id")

    # Step 2: get OTP via admin API
    time.sleep(0.5)
    code = get_otp_from_admin_api(normalized_phone)
    if not code:
        return customer, None

    # Step 3: verify-otp to get JWT
    r3 = requests.post(f"{API_BASE}/auth/verify-otp",
                       json={"phone": normalized_phone, "code": code, "session_id": session_id}, timeout=10)
    if r3.status_code != 200:
        return customer, None

    new_token = r3.json().get("access_token")
    if not new_token:
        return customer, None

    # Step 4: optionally update profile (name/email)
    r4 = requests.post(
        f"{API_BASE}/auth/register",
        headers={"Authorization": f"Bearer {new_token}"},
        json={"name": customer.get("name", ""), "email": customer.get("email", "")},
        timeout=10
    )

    updated = {**customer, "token": new_token, "phone": normalized_phone}
    # Update user_id if verify-otp returned a new user
    if r3.status_code == 200:
        me = requests.get(f"{API_BASE}/users/me",
                         headers={"Authorization": f"Bearer {new_token}"}, timeout=10)
        if me.status_code == 200:
            updated["user_id"] = me.json().get("id")

    return updated, new_token


# ── Staff Authentication Helpers ─────────────────────────────────────
# Used to authenticate as store staff for dine-in order management

_STAFF_TOKEN_CACHE = {}


def login_staff(email: str, password: str):
    """Login as staff member, returns token or None."""
    import requests
    resp = requests.post(
        f"{API_BASE}/auth/login-password",
        json={"email": email, "password": password},
        timeout=10
    )
    if resp.status_code == 200:
        return resp.json().get("access_token")
    return None


def get_staff_token(staff_email: str, staff_password: str = None):
    """Get cached or fresh staff token.
    
    Args:
        staff_email: Staff member's email
        staff_password: Staff password (only needed if not cached)
    
    Returns:
        Staff access token or None
    """
    import requests
    if staff_email in _STAFF_TOKEN_CACHE:
        cached = _STAFF_TOKEN_CACHE[staff_email]
        import time
        if time.time() < cached.get("expires_at", 0):
            return cached["token"]
    
    token = login_staff(staff_email, staff_password)
    if token:
        import time
        _STAFF_TOKEN_CACHE[staff_email] = {
            "token": token,
            "expires_at": time.time() + 1800,
        }
    return token


def clear_staff_token_cache():
    """Clear all cached staff tokens."""
    global _STAFF_TOKEN_CACHE
    _STAFF_TOKEN_CACHE = {}


def get_staff_for_store(store_id: int):
    """Get staff credentials for a specific store from state.
    
    Returns dict with email and temp_password, or None if not found.
    Staff list is loaded from seed_state.json created by verify_seed_04_staff.py
    """
    staff_list = load_state("staff")
    if not staff_list:
        return None
    for s in staff_list:
        if s.get("store_id") == store_id and s.get("type") in ("STAFF", "STORE_MGMT"):
            return s
    return None


# ── QR Code / Table Scan Helpers ─────────────────────────────────────

def scan_table_qr(store_slug: str, table_id: int):
    """Simulate customer scanning QR code on table.
    
    Args:
        store_slug: Store identifier (e.g., 'store-klcc')
        table_id: Table ID to scan
    
    Returns:
        Dict with store_id, store_name, table_id, table_number, capacity
        or None on failure
    """
    import requests
    resp = requests.post(
        f"{API_BASE}/tables/scan",
        json={"store_slug": store_slug, "table_id": table_id},
        timeout=10
    )
    if resp.status_code == 200:
        return resp.json()
    return None


def get_store_tables(store_id: int):
    """Get all tables for a store.
    
    Returns list of table dicts with id, table_number, capacity, is_occupied, etc.
    """
    resp = api_get(f"/admin/stores/{store_id}/tables")
    if resp.status_code == 200:
        tables = resp.json()
        if isinstance(tables, dict):
            return tables.get("tables", [])
        return tables if isinstance(tables, list) else []
    return []


def get_available_tables(store_id: int):
    """Get available (non-occupied) tables for a store."""
    tables = get_store_tables(store_id)
    return [t for t in tables if t.get("is_active") and not t.get("is_occupied")]


# ── Customer Token Resolution ───────────────────────────────────────
# Resolves a user_id to the customer's JWT token from seed_state.json.
# Used by flow scripts to apply vouchers and check wallet balance with
# the correct customer-scoped token instead of the admin token.

def get_customer_token_for_user(user_id):
    """Look up the customer token for a given user_id from seed_state.json.
    Returns the JWT token string, or None if not found."""
    customers = load_state("customers")
    if not customers:
        return None
    for c in customers:
        if c.get("user_id") == user_id:
            token = c.get("token")
            if token:
                return token
    return None


# ── Customer Token Refresh ──────────────────────────────────────────
# Handles 401 responses by re-authenticating the customer via OTP.
# Updates the token in seed_state.json so subsequent calls succeed.

def refresh_customer_token(user_id):
    """Re-authenticate a customer by user_id. Updates token in state file.
    Returns new token or None on failure."""
    customers = load_state("customers")
    if not customers:
        return None
    for c in customers:
        if c.get("user_id") == user_id:
            updated, new_token = re_auth_customer(c)
            if new_token:
                # Update state file
                for i, existing in enumerate(customers):
                    if existing.get("user_id") == user_id:
                        customers[i] = updated
                        break
                save_state("customers", customers)
                return new_token
    return None


def api_get_with_refresh(path, token=None, params=None, user_id=None):
    """GET with automatic 401 retry via customer token refresh."""
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.get(f"{API_BASE}{path}", headers=h, params=params, timeout=10)
    if resp.status_code == 401 and user_id:
        new_token = refresh_customer_token(user_id)
        if new_token:
            h = {"Authorization": f"Bearer {new_token}"}
            resp = requests.get(f"{API_BASE}{path}", headers=h, params=params, timeout=10)
    return resp


def api_post_with_refresh(path, token=None, json=None, user_id=None):
    """POST with automatic 401 retry via customer token refresh."""
    import requests
    h = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.post(f"{API_BASE}{path}", headers=h, json=json, timeout=10)
    if resp.status_code == 401 and user_id:
        new_token = refresh_customer_token(user_id)
        if new_token:
            h = {"Authorization": f"Bearer {new_token}"}
            resp = requests.post(f"{API_BASE}{path}", headers=h, json=json, timeout=10)
    return resp


# ── Mock Service Health Check ───────────────────────────────────────
# Verifies all required mock services are running before seed steps begin.

MOCK_SERVICES = {
    "Mock Payment Gateway": os.environ.get("MOCK_PG_URL", "http://localhost:8889"),
    "Mock Delivery Server": os.environ.get("MOCK_DELIVERY_URL", "http://localhost:8888"),
}

def check_mock_services():
    """Check that all required mock services are responding.
    Returns (all_healthy, details_dict)."""
    import requests
    details = {}
    all_healthy = True
    for name, url in MOCK_SERVICES.items():
        try:
            resp = requests.get(f"{url}/health", timeout=3)
            if resp.status_code == 200:
                details[name] = "OK"
            else:
                details[name] = f"UNHEALTHY (status {resp.status_code})"
                all_healthy = False
        except Exception as e:
            details[name] = f"UNREACHABLE ({e})"
            all_healthy = False
    return all_healthy, details


# ── State Rebuild from API ──────────────────────────────────────────
# Rebuilds seed_state.json from live API data to prevent state file drift.

def rebuild_state_from_api():
    """Query the API and rebuild seed_state.json with fresh data.
    Returns True on success, False on failure."""
    tok = admin_token()
    state = {}

    # Rebuild customers from admin API
    try:
        resp = api_get("/admin/customers?page_size=200", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            customers = data.get("customers", []) if isinstance(data, dict) else data
            state["customers"] = customers
            print(f"  Rebuilt customers state: {len(customers)} customers from API")
    except Exception as e:
        print(f"  Warning: Could not rebuild customers state: {e}")

    # Rebuild staff from admin API (no aggregate endpoint; query HQ + per-store)
    try:
        all_staff = []
        resp = api_get("/admin/hq-staff", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            hq = data.get("staff", []) if isinstance(data, dict) else data
            all_staff.extend(hq)

        stores_resp = api_get("/admin/stores", token=tok)
        if stores_resp.status_code == 200:
            sdata = stores_resp.json()
            stores = sdata.get("stores", []) if isinstance(sdata, dict) else sdata
            for store in stores:
                sid = store.get("id")
                if sid is None:
                    continue
                sr = api_get(f"/admin/stores/{sid}/staff", token=tok)
                if sr.status_code == 200:
                    sd = sr.json()
                    store_staff = sd.get("staff", []) if isinstance(sd, dict) else sd
                    all_staff.extend(store_staff)

        state["staff"] = all_staff
        print(f"  Rebuilt staff state: {len(all_staff)} staff from API")
    except Exception as e:
        print(f"  Warning: Could not rebuild staff state: {e}")

    # Rebuild completed orders
    try:
        resp = api_get("/admin/orders?status=completed&page_size=500", token=tok)
        if resp.status_code == 200:
            data = resp.json()
            orders = data.get("orders", []) if isinstance(data, dict) else data
            state["completed_orders"] = orders
            print(f"  Rebuilt completed_orders state: {len(orders)} orders from API")
    except Exception as e:
        print(f"  Warning: Could not rebuild completed_orders state: {e}")

    # Write rebuilt state
    import json
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)
    print(f"  State file rebuilt: {STATE_FILE}")
    return True
