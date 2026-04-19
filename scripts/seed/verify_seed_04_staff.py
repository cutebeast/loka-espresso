"""
SEED SCRIPT: verify_seed_04_staff.py
Purpose: Create 21 staff users (3 HQ + 7 store mgmt + 11 store staff)
APIs tested: POST /admin/hq-staff, POST /admin/stores/{id}/staff, GET /admin/hq-staff, GET /admin/stores/{id}/staff
Status: CERTIFIED-2026-04-19 | API-only implementation (except Step 00 which uses SQL for reset)
Dependencies: verify_seed_01_stores.py (stores must exist at ids 2-6)
Idempotency: All staff checked via GET APIs before creating.
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, admin_token, print_header
import db_validate


STORE_IDS = [2, 3, 4, 5, 6]


HQ_STAFF = [
    {"name": "Ahmad Razif",   "email": "hq_mgr_1@fnb.com",    "phone": "+60110001001", "user_type_id": 1, "role_id": 7},
    {"name": "Nurul Huda",    "email": "hq_mgr_2@fnb.com",    "phone": "+60110001002", "user_type_id": 1, "role_id": 7},
    {"name": "Lim Jia Shen",  "email": "hq_staff_1@fnb.com",  "phone": "+60110001003", "user_type_id": 1, "role_id": 7},
]


STORE_MANAGEMENT = [
    {"name": "Syed Faris",    "email": "mgr_klcc@fnb.com",    "phone": "+60110002001", "user_type_id": 2, "role_id": 3, "store_id": 2},
    {"name": "Danial Hakim",  "email": "astmgr_klcc@fnb.com", "phone": "+60110002002", "user_type_id": 2, "role_id": 4, "store_id": 2},
    {"name": "Zara Lee",      "email": "mgr_pavilion@fnb.com","phone": "+60110003001", "user_type_id": 2, "role_id": 3, "store_id": 3},
    {"name": "Qisya Amin",   "email": "astmgr_pavilion@fnb.com","phone": "+60110003002","user_type_id": 2, "role_id": 4, "store_id": 3},
    {"name": "Fikri Haikal",  "email": "mgr_cheras@fnb.com",  "phone": "+60110004001", "user_type_id": 2, "role_id": 3, "store_id": 4},
    {"name": "Hanis Nabilah","email": "mgr_pj@fnb.com",        "phone": "+60110005001", "user_type_id": 2, "role_id": 3, "store_id": 5},
    {"name": "Irfan Zulkifli","email": "mgr_bangi@fnb.com",   "phone": "+60110006001", "user_type_id": 2, "role_id": 3, "store_id": 6},
]


STORE_STAFF = [
    {"name": "Ainul Mardhiyah","email": "staff_klcc_1@fnb.com","phone": "+60110002011","store_id": 2, "role": "barista"},
    {"name": "Buddhi Nair",    "email": "staff_klcc_2@fnb.com","phone": "+60110002012","store_id": 2, "role": "cashier"},
    {"name": "Nadzmi Hakimi",  "email": "staff_klcc_3@fnb.com","phone": "+60110002013","store_id": 2, "role": "delivery"},
    {"name": "Siti Fatimah",   "email": "staff_pavilion_1@fnb.com","phone": "+60110003011","store_id": 3, "role": "barista"},
    {"name": "Ravi Kumar",     "email": "staff_pavilion_2@fnb.com","phone": "+60110003012","store_id": 3, "role": "cashier"},
    {"name": "Yeo Jia Ling",  "email": "staff_cheras_1@fnb.com","phone": "+60110004011","store_id": 4, "role": "barista"},
    {"name": "Amirul Hazri",   "email": "staff_cheras_2@fnb.com","phone": "+60110004012","store_id": 4, "role": "cashier"},
    {"name": "Nadia Adriana",  "email": "staff_pj_1@fnb.com",  "phone": "+60110005011","store_id": 5, "role": "barista"},
    {"name": "Fadli Syazani",  "email": "staff_bangi_1@fnb.com","phone": "+60110006011","store_id": 6, "role": "barista"},
    {"name": "Aqila Zahrah",   "email": "staff_bangi_2@fnb.com","phone": "+60110006012","store_id": 6, "role": "cashier"},
    {"name": "Harith Danish",  "email": "staff_bangi_3@fnb.com","phone": "+60110006013","store_id": 6, "role": "delivery"},
]


def _staff_exists_by_email(email, token):
    """Returns True if a user with this email already exists using API."""
    # Check HQ staff
    resp = api_get("/admin/hq-staff", token=token)
    if resp.status_code == 200:
        data = resp.json()
        staff_list = data if isinstance(data, list) else data.get("staff", [])
        for s in staff_list:
            if s.get("email") == email:
                return True
    
    # Check all stores
    resp = api_get("/admin/stores", token=token)
    if resp.status_code == 200:
        data = resp.json()
        stores = data if isinstance(data, list) else data.get("stores", [])
        for store in stores:
            store_id = store.get("id")
            resp = api_get(f"/admin/stores/{store_id}/staff", token=token)
            if resp.status_code == 200:
                data = resp.json()
                staff_list = data if isinstance(data, list) else data.get("staff", [])
                for s in staff_list:
                    if s.get("email") == email:
                        return True
    return False


def _create_hq_staff(s, token):
    # Idempotent: check API first
    if _staff_exists_by_email(s["email"], token):
        return None
    resp = api_post("/admin/hq-staff", token=token, json={
        "name": s["name"], "email": s["email"], "phone": s["phone"],
        "user_type_id": s["user_type_id"], "role_id": s["role_id"], "is_active": True,
    })
    if resp.status_code == 400 and "already exists" in resp.text:
        return None
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Create HQ staff '{s['email']}' failed: {resp.status_code} {resp.text}")
    return resp.json().get("temp_password")


def _create_store_staff(s, token, is_mgmt=False):
    # Idempotent: check API first
    if _staff_exists_by_email(s["email"], token):
        return None
    payload = {
        "name": s["name"], "email": s["email"], "phone": s["phone"],
        "role": s.get("role", "barista"), "is_active": True,
    }
    if is_mgmt:
        payload["user_type_id"] = s["user_type_id"]
        payload["role_id"] = s["role_id"]
    else:
        payload["user_type_id"] = 3
        payload["role_id"] = 5
    resp = api_post(f"/admin/stores/{s['store_id']}/staff", token=token, json=payload)
    if resp.status_code == 400 and "already exists" in resp.text:
        return None
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Create staff '{s['email']}' failed: {resp.status_code} {resp.text}")
    return resp.json().get("temp_password")


def run():
    print_header("STEP 04: Create Staff Users")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    created = []
    skipped = []

    print(f"\n[*] Creating {len(HQ_STAFF)} HQ staff...")
    for s in HQ_STAFF:
        pwd = _create_hq_staff(s, token)
        if pwd:
            created.append({"name": s["name"], "email": s["email"], "temp_password": pwd, "type": "HQ"})
            print(f"  ✓ NEW: {s['name']} ({s['email']}) — pwd: {pwd}")
        else:
            skipped.append(s["email"])
            print(f"  - Already exists: {s['email']}")

    print(f"\n[*] Creating {len(STORE_MANAGEMENT)} store management users...")
    for s in STORE_MANAGEMENT:
        pwd = _create_store_staff(s, token, is_mgmt=True)
        if pwd:
            created.append({"name": s["name"], "email": s["email"], "temp_password": pwd, "type": "STORE_MGMT"})
            print(f"  ✓ NEW: {s['name']} ({s['email']}) store {s['store_id']} — pwd: {pwd}")
        else:
            skipped.append(s["email"])
            print(f"  - Already exists: {s['email']}")

    print(f"\n[*] Creating {len(STORE_STAFF)} store staff users...")
    for s in STORE_STAFF:
        pwd = _create_store_staff(s, token)
        if pwd:
            created.append({"name": s["name"], "email": s["email"], "temp_password": pwd, "type": "STAFF"})
            print(f"  ✓ NEW: {s['name']} ({s['email']}) store {s['store_id']} — pwd: {pwd}")
        else:
            skipped.append(s["email"])
            print(f"  - Already exists: {s['email']}")

    total = len(HQ_STAFF) + len(STORE_MANAGEMENT) + len(STORE_STAFF)
    print(f"\n[*] DB Validation: staff users...")
    ok, count, msg = db_validate.validate_staff_users()
    if not ok:
        raise RuntimeError(f"Staff users validation: {msg}")
    print(f"  ✓ {count} staff users in DB ({total - len(skipped)} new, {len(skipped)} already existed)")

    if created:
        print(f"\n[*] Login validation: testing up to 3 newly created accounts...")
        for acct in created[:3]:
            resp = api_post("/auth/login-password", json={
                "email": acct["email"], "password": acct["temp_password"],
            })
            if resp.status_code != 200:
                raise RuntimeError(f"Login test for '{acct['email']}' failed: {resp.status_code} {resp.text}")
            print(f"  ✓ Login OK: {acct['email']}")

    print(f"\n[✓] STEP 04 complete — {len(created)} newly created, {len(skipped)} already existed")

    if created:
        print("\n[NEW ACCOUNTS]")
        for c in created:
            print(f"  {c['email']} / {c['temp_password']} ({c['type']})")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_04_staff.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)