"""
SEED SCRIPT: verify_seed_01_stores.py
Purpose: Create HQ + 5 physical stores with tables
APIs tested: POST /admin/system/init-hq, POST /admin/stores, POST /admin/stores/{id}/tables, GET /admin/stores, GET /admin/stores
Status: PENDING - Converting to API-only (no direct DB calls)
Dependencies: verify_seed_00_full_reset.py (clean DB)
"""

import sys, os
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SEED_DIR)
from shared_config import api_post, api_get, admin_token, print_header
import db_validate


STORES = [
    {
        "name": "Loka Espresso KLCC",
        "slug": "le-klcc",
        "address": "Lot 238, Level 2, Suria KLCC, 50088 Kuala Lumpur",
        "lat": 3.1585,
        "lng": 101.7124,
        "phone": "+60323818888",
        "tables": ["A1", "A2", "B1", "B2", "P1"],
    },
    {
        "name": "Loka Espresso Pavilion",
        "slug": "le-pavilion",
        "address": "Level 1, Pavilion KL, Jalan Bukit Bintang, 55100 Kuala Lumpur",
        "lat": 3.1492,
        "lng": 101.7139,
        "phone": "+60323819999",
        "tables": ["A1", "A2", "B1", "B2", "P1"],
    },
    {
        "name": "Loka Espresso Cheras",
        "slug": "le-cheras",
        "address": "No 12, Jalan Cheras, 56000 Kuala Lumpur",
        "lat": 3.1000,
        "lng": 101.7500,
        "phone": "+60388881234",
        "tables": ["A1", "A2", "B1", "C1", "C2"],
    },
    {
        "name": "Loka Espresso PJ",
        "slug": "le-pj",
        "address": "SS2, Petaling Jaya, 47300 Selangor",
        "lat": 3.1128,
        "lng": 101.6268,
        "phone": "+60378651234",
        "tables": ["A1", "A2", "B1", "B2"],
    },
    {
        "name": "Loka Espresso Bangi",
        "slug": "le-bangi",
        "address": "Jalan Reko, Bandar Baru Bangi, 43650 Selangor",
        "lat": 2.9533,
        "lng": 101.7902,
        "phone": "+60389251234",
        "tables": ["A1", "A2", "B1", "B2"],
    },
]


def _get_store_by_slug(slug, token):
    """Get store ID by slug using GET /admin/stores API."""
    resp = api_get("/admin/stores", token=token)
    if resp.status_code != 200:
        return None
    data = resp.json()
    stores = data if isinstance(data, list) else data.get("stores", [])
    for s in stores:
        if s.get("slug") == slug:
            return s.get("id")
    return None


def _get_table_count(store_id, token):
    """Get table count using GET /admin/stores/{id}/tables API."""
    resp = api_get(f"/admin/stores/{store_id}/tables", token=token)
    if resp.status_code != 200:
        return 0
    data = resp.json()
    # Response is a list of table objects
    if isinstance(data, list):
        return len(data)
    return len(data.get("tables", []))


def run():
    print_header("STEP 01: Create Stores")

    token = admin_token()
    if not token:
        raise RuntimeError("Could not get admin token")

    print("[*] Ensuring HQ store exists (id=0)...")
    resp = api_post("/admin/system/init-hq", token=token)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"init-hq failed: {resp.status_code} {resp.text}")
    hq_data = resp.json()
    print(f"  ✓ {hq_data['message']} — {hq_data['name']} (id={hq_data['store_id']})")

    created_stores = []
    print(f"\n[*] Creating {len(STORES)} physical stores via POST /admin/stores...")
    for i, store in enumerate(STORES, 1):
        existing_id = _get_store_by_slug(store["slug"], token)
        if existing_id:
            created_stores.append({**store, "id": existing_id})
            print(f"  [{i}] {store['name']} — already exists (id={existing_id}), skipping")
            continue
        payload = {
            "name": store["name"],
            "slug": store["slug"],
            "address": store["address"],
            "lat": store["lat"],
            "lng": store["lng"],
            "phone": store["phone"],
        }
        resp = api_post("/admin/stores", token=token, json=payload)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Create store '{store['name']}' failed: {resp.status_code} {resp.text}")
        data = resp.json()
        store_id = data.get("id")
        created_stores.append({**store, "id": store_id})
        print(f"  [{i}] {store['name']} — id={store_id}")

    print(f"\n[*] Creating tables for each store via POST /admin/stores/{{id}}/tables...")
    for store in created_stores:
        existing_tables = _get_table_count(store["id"], token)
        if existing_tables > 0:
            print(f"  {store['name']}: already has {existing_tables} tables, skipping")
            continue
        for table_num in store["tables"]:
            capacity = 8 if "C" in table_num else (6 if "B" in table_num else 4)
            payload = {"table_number": table_num, "capacity": capacity}
            resp = api_post(f"/admin/stores/{store['id']}/tables", token=token, json=payload)
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Create table {table_num} for store {store['id']} failed: {resp.status_code} {resp.text}")

        resp = api_post(f"/admin/stores/{store['id']}/tables", token=token, json={
            "table_number": "PICKUP",
            "capacity": 0,
        })
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Create PICKUP table for store {store['id']} failed: {resp.status_code} {resp.text}")

        # Generate QR codes for all dine-in tables so they can be scanned
        print(f"  [*] Generating QR codes for {store['name']}...")
        tables_resp = api_get(f"/stores/{store['id']}/tables", token=token)
        if tables_resp.status_code == 200:
            for tbl in tables_resp.json():
                if tbl.get("table_number") != "PICKUP" and not tbl.get("qr_code_url"):
                    qr_resp = api_post(f"/admin/stores/{store['id']}/tables/{tbl['id']}/generate-qr", token=token)
                    if qr_resp.status_code not in (200, 201):
                        print(f"    ⚠ QR generation failed for table {tbl['table_number']}: {qr_resp.status_code}")

        print(f"  ✓ {store['name']}: {len(store['tables'])} tables + PICKUP counter + QR codes")

    print("\n[*] Validating via GET /admin/stores...")
    resp = api_get("/admin/stores", token=token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET /admin/stores failed: {resp.status_code}")
    stores_list = resp.json()
    print(f"  ✓ {len(stores_list)} stores returned by API")

    print("\n[*] DB Validation: stores...")
    ok, count, msg = db_validate.validate_stores(len(STORES))
    if not ok:
        raise RuntimeError(f"Store validation failed: {msg}")
    print(f"  ✓ {msg}")

    print("\n[*] DB Validation: store tables...")
    for store in created_stores:
        ok, count, msg = db_validate.validate_store_tables(store["id"], min(len(store["tables"]), 3))
        if not ok:
            raise RuntimeError(f"Tables validation for store {store['id']}: {msg}")
    print(f"  ✓ Tables validated for all {len(STORES)} stores")

    print("\n[✓] STEP 01 complete — stores created")


if __name__ == "__main__":
    try:
        run()
        print("\n[SUCCESS] seed_01_stores.py")
    except RuntimeError as e:
        print(f"\n[FAILED] {e}")
        sys.exit(1)
