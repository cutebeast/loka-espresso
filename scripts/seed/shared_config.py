"""
Shared configuration for all seed scripts.
NO direct DB access - all data flows through API calls only.
Last updated: 2026-04-18 | ENHANCED - Staff auth, QR scan, and table helpers added

IMPORTANT: Order of execution for customer seeding:
00-09: Base system seeds (stores, menu, inventory, staff, config, rewards, vouchers, promotions)
10: Register 50 customers via OTP
11: Wallet topup (RM 100-500, multiples of 50)
12a: Place PICKUP orders
12b: Place DELIVERY orders (requires 3rdparty_delivery/mock_delivery_server.py)
12c: Place DINE-IN orders (tests QR scan and table assignment)
13: Complete DELIVERY orders via mock 3rd party API
14: Complete DINE-IN orders via manual staff workflow (OR run 15 instead)
15: Complete DINE-IN orders via POS integration (OR run 14 instead)
"""
import os

API_BASE    = os.environ.get("API_BASE",    "https://admin.loyaltysystem.uk/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@loyaltysystem.uk")
ADMIN_PASS  = os.environ.get("ADMIN_PASS",  "admin123")

# ── Admin token cache ──────────────────────────────────────────────
# Caches the admin token for the lifetime of the process to avoid
# flooding the rate limiter with login-password calls.
_admin_token_cache = {"token": None, "expires_at": 0}

# Data directory for inter-script state
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(SEED_DIR, "seed_state.json")

# Store IDs available in the system (physical stores, not HQ)
STORE_IDS = [2, 3, 4, 5, 6]

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
    state[key] = data
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)

def load_state(key):
    """Load script state from JSON file."""
    import json, os
    if not os.path.exists(STATE_FILE):
        return None
    with open(STATE_FILE) as f:
        state = json.load(f)
    return state.get(key)

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

    # Step 2: get OTP via admin API
    time.sleep(0.5)
    code = get_otp_from_admin_api(phone)
    if not code:
        # Fallback: try common test codes
        for code in ["123456", "000000", "111111"]:
            r2 = requests.post(f"{API_BASE}/auth/verify-otp",
                             json={"phone": phone, "code": code}, timeout=10)
            if r2.status_code == 200:
                break
        else:
            return customer, None

    # Step 3: verify-otp to get JWT
    r3 = requests.post(f"{API_BASE}/auth/verify-otp",
                       json={"phone": phone, "code": code}, timeout=10)
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

    updated = {**customer, "token": new_token}
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
    resp = api_get(f"/stores/{store_id}/tables")
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
