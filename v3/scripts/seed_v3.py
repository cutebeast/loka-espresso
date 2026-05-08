#!/usr/bin/env python3
"""
V3 SAFE SEED SCRIPT — FNB Super App Enterprise v3
==================================================
Purpose: Seed demo data into v3 database via API calls ONLY.
SAFETY:  This script NEVER truncates or wipes tables. It is fully idempotent.
         If data already exists, it skips creation.

Usage:   cd /root/fnb-super-app/v3 && python3 scripts/seed_v3.py
API:     http://localhost:13800/api/v1
Admin:   admin@lokaespresso.my / admin123
"""

import os
import sys
import time
import uuid
import random
import requests
from datetime import date, datetime, timezone, timedelta, time as dt_time

API_BASE = os.environ.get("API_BASE", "http://localhost:13800/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@lokaespresso.my")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

# ── Uploads base URL (served by Caddy from /root/fnb-super-app/uploads)
UPLOADS_BASE = "https://admin.loyaltysystem.uk/uploads"

# Seed data
STORES = [
    {
        "store_code": "HQ",
        "store_name": "Loka Espresso HQ",
        "slug": "hq",
        "brand_name": "Loka Espresso",
        "address_line_1": "Menara KL, Jalan Ampang",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "50450",
        "country_code": "MY",
        "phone_number": "+60323810000",
        "email_address": "hq@lokaespresso.my",
        "latitude": 3.1585,
        "longitude": 101.7124,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/promos/promo-56-summer.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
    {
        "store_code": "KLCC",
        "store_name": "Loka Espresso KLCC",
        "slug": "le-klcc",
        "brand_name": "Loka Espresso",
        "address_line_1": "Lot 238, Level 2, Suria KLCC",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "50088",
        "country_code": "MY",
        "phone_number": "+60323818888",
        "email_address": "klcc@lokaespresso.my",
        "latitude": 3.1585,
        "longitude": 101.7124,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/promos/promo-54-new-menu.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
    {
        "store_code": "PAV",
        "store_name": "Loka Espresso Pavilion",
        "slug": "le-pavilion",
        "brand_name": "Loka Espresso",
        "address_line_1": "Level 1, Pavilion KL, Jalan Bukit Bintang",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "55100",
        "country_code": "MY",
        "phone_number": "+60323819999",
        "email_address": "pavilion@lokaespresso.my",
        "latitude": 3.1492,
        "longitude": 101.7139,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/promos/promo-55-store-review.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
    {
        "store_code": "CHR",
        "store_name": "Loka Espresso Cheras",
        "slug": "le-cheras",
        "brand_name": "Loka Espresso",
        "address_line_1": "No 12, Jalan Cheras",
        "city": "Kuala Lumpur",
        "state_province": "Wilayah Persekutuan",
        "postal_code": "56000",
        "country_code": "MY",
        "phone_number": "+60388881234",
        "email_address": "cheras@lokaespresso.my",
        "latitude": 3.1000,
        "longitude": 101.7500,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/information/popup-welcome.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
    {
        "store_code": "PJ",
        "store_name": "Loka Espresso PJ",
        "slug": "le-pj",
        "brand_name": "Loka Espresso",
        "address_line_1": "SS2, Petaling Jaya",
        "city": "Petaling Jaya",
        "state_province": "Selangor",
        "postal_code": "47300",
        "country_code": "MY",
        "phone_number": "+60378651234",
        "email_address": "pj@lokaespresso.my",
        "latitude": 3.1128,
        "longitude": 101.6268,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/information/info-coffee-demo.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
    {
        "store_code": "BNG",
        "store_name": "Loka Espresso Bangi",
        "slug": "le-bangi",
        "brand_name": "Loka Espresso",
        "address_line_1": "Jalan Reko, Bandar Baru Bangi",
        "city": "Bangi",
        "state_province": "Selangor",
        "postal_code": "43650",
        "country_code": "MY",
        "phone_number": "+60389251234",
        "email_address": "bangi@lokaespresso.my",
        "latitude": 2.9533,
        "longitude": 101.7902,
        "timezone": "Asia/Kuala_Lumpur",
        "currency_code": "MYR",
        "logo_url": f"{UPLOADS_BASE}/stores/bd86ba4c688847c7944ea5115a2bcdbd.jpg",
        "banner_image_url": f"{UPLOADS_BASE}/information/turkish-coffee-reading.jpg",
        "is_active": True,
        "is_accepting_orders": True,
    },
]

MENU_CATEGORIES = [
    {"name": "Signature Coffee", "slug": "signature-coffee", "image_url": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
    {"name": "Espresso Bar", "slug": "espresso-bar", "image_url": f"{UPLOADS_BASE}/products/gallery-16-muvna-brew-1.jpg"},
    {"name": "Tea & Non-Coffee", "slug": "tea-non-coffee", "image_url": f"{UPLOADS_BASE}/products/gallery-14-go-1.jpg"},
    {"name": "Pastries & Toast", "slug": "pastries-toast", "image_url": f"{UPLOADS_BASE}/rewards/reward-107-croissant.jpg"},
    {"name": "Specialties", "slug": "specialties", "image_url": f"{UPLOADS_BASE}/products/gallery-18-loveramics-1.jpg"},
    {"name": "Iced & Blended", "slug": "iced-blended", "image_url": f"{UPLOADS_BASE}/products/gallery-15-kesu-1.jpg"},
    {"name": "Food & Sandwiches", "slug": "food-sandwiches", "image_url": f"{UPLOADS_BASE}/information/info-4-baklava.jpg"},
    {"name": "Desserts", "slug": "desserts", "image_url": f"{UPLOADS_BASE}/rewards/reward-108-tiramisu.jpg"},
    {"name": "Merchandise", "slug": "merchandise", "image_url": f"{UPLOADS_BASE}/rewards/reward-109-tumbler.jpg"},
    {"name": "Coffee Beans & Packs", "slug": "coffee-beans-packs", "image_url": f"{UPLOADS_BASE}/products/gallery-19-kettle-1.jpg"},
]

MENU_ITEMS = {
    "Signature Coffee": [
        {"name": "Caramel Latte", "price": 12.90, "desc": "Rich espresso with steamed milk and caramel syrup", "featured": True, "image": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
        {"name": "Gula Melaka Latte", "price": 13.90, "desc": "Signature latte with palm sugar syrup", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-16-muvna-brew-2.jpg"},
        {"name": "Durian Cappuccino", "price": 16.90, "desc": "Bold cappuccino with durian cream", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-17-muvna-hand-1.jpg"},
    ],
    "Espresso Bar": [
        {"name": "Americano", "price": 8.90, "desc": "Espresso with hot water", "featured": True, "image": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
        {"name": "Cappuccino", "price": 10.90, "desc": "Classic Italian cappuccino", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-16-muvna-brew-1.jpg"},
        {"name": "Espresso", "price": 8.90, "desc": "Double shot espresso", "featured": False, "image": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
        {"name": "Flat White", "price": 11.90, "desc": "Velvety microfoam over espresso", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-18-loveramics-1.jpg"},
        {"name": "Mocha", "price": 13.90, "desc": "Espresso with chocolate and steamed milk", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-15-kesu-1.jpg"},
    ],
    "Tea & Non-Coffee": [
        {"name": "Teh Tarik", "price": 8.90, "desc": "Pulled tea with condensed milk", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-14-go-1.jpg"},
        {"name": "Matcha Latte", "price": 12.90, "desc": "Japanese green tea latte", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-14-go-2.jpg"},
        {"name": "Cham", "price": 9.90, "desc": "Coffee and tea blend", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-14-go-3.jpg"},
        {"name": "Iced Lemon Tea", "price": 8.90, "desc": "Refreshing iced lemon tea", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-13-duo-1.jpg"},
    ],
    "Pastries & Toast": [
        {"name": "Croissant", "price": 9.90, "desc": "Buttery French croissant", "featured": True, "image": f"{UPLOADS_BASE}/rewards/reward-107-croissant.jpg"},
        {"name": "Kaya Toast", "price": 7.90, "desc": "Classic Malaysian kaya toast", "featured": False, "image": f"{UPLOADS_BASE}/information/info-5-pide.jpg"},
        {"name": "Chocolate Muffin", "price": 10.90, "desc": "Rich chocolate chip muffin", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-15-kesu-2.jpg"},
        {"name": "Cheese Danish", "price": 11.90, "desc": "Flaky pastry with cheese filling", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-15-kesu-3.jpg"},
    ],
    "Specialties": [
        {"name": "Affogato", "price": 14.90, "desc": "Espresso over vanilla ice cream", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-18-loveramics-2.jpg"},
        {"name": "Vanilla Latte", "price": 12.90, "desc": "Latte with vanilla syrup", "featured": False, "image": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
        {"name": "Kopi O Kosong", "price": 8.90, "desc": "Strong black coffee with sugar", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-19-kettle-1.jpg"},
    ],
    "Iced & Blended": [
        {"name": "Iced Chocolate", "price": 11.90, "desc": "Chilled chocolate milk drink", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-15-kesu-1.jpg"},
        {"name": "Iced Caramel Latte", "price": 13.90, "desc": "Chilled caramel latte over ice", "featured": True, "image": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
        {"name": "Frappe Mocha", "price": 14.90, "desc": "Blended iced coffee with chocolate", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-16-muvna-brew-1.jpg"},
    ],
    "Food & Sandwiches": [
        {"name": "Chicken Sandwich", "price": 13.90, "desc": "Grilled chicken with fresh vegetables", "featured": False, "image": f"{UPLOADS_BASE}/information/info-4-baklava.jpg"},
        {"name": "Tuna Wrap", "price": 12.90, "desc": "Tuna salad wrap with lettuce", "featured": False, "image": f"{UPLOADS_BASE}/information/info-5-pide.jpg"},
        {"name": "Egg Mayo Sandwich", "price": 10.90, "desc": "Classic egg mayonnaise sandwich", "featured": False, "image": f"{UPLOADS_BASE}/information/info-coffee-demo.jpg"},
    ],
    "Desserts": [
        {"name": "Tiramisu", "price": 15.90, "desc": "Italian coffee-flavoured dessert", "featured": True, "image": f"{UPLOADS_BASE}/rewards/reward-108-tiramisu.jpg"},
        {"name": "Cheesecake", "price": 14.90, "desc": "New York style cheesecake", "featured": False, "image": f"{UPLOADS_BASE}/rewards/reward-110-rm5-off.jpg"},
        {"name": "Brownie", "price": 11.90, "desc": "Rich chocolate brownie", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-15-kesu-2.jpg"},
    ],
    "Merchandise": [
        {"name": "Loka Tumbler", "price": 49.90, "desc": "Branded reusable tumbler 450ml", "featured": True, "image": f"{UPLOADS_BASE}/rewards/reward-109-tumbler.jpg"},
        {"name": "Loka Pouch", "price": 29.90, "desc": "Loka drawstring pouch bag", "featured": False, "image": f"{UPLOADS_BASE}/rewards/reward-111-mystery-reward.jpg"},
        {"name": "Loka Soft Toy", "price": 39.90, "desc": "Cute Loka bear soft toy", "featured": False, "image": f"{UPLOADS_BASE}/rewards/reward-106-caramel-latte.jpg"},
        {"name": "Coaster Set", "price": 19.90, "desc": "Pack of 4 Loka coasters", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-13-duo-2.jpg"},
    ],
    "Coffee Beans & Packs": [
        {"name": "Arabica Beans 250g", "price": 45.00, "desc": "Premium single-origin arabica", "featured": True, "image": f"{UPLOADS_BASE}/products/gallery-19-kettle-2.jpg"},
        {"name": "Blend Pack", "price": 38.00, "desc": "House blend 250g pack", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-19-kettle-3.jpg"},
        {"name": "Drip Coffee Set", "price": 55.00, "desc": "Pour-over dripper + 100g beans", "featured": False, "image": f"{UPLOADS_BASE}/products/gallery-17-muvna-hand-2.jpg"},
    ],
}

ALLERGENS = [
    {"key": "dairy", "name": "Dairy", "severity": "high", "icon": f"{UPLOADS_BASE}/products/gallery-16-muvna-brew-1.jpg"},
    {"key": "gluten", "name": "Gluten", "severity": "high", "icon": f"{UPLOADS_BASE}/products/gallery-14-go-1.jpg"},
    {"key": "nuts", "name": "Nuts", "severity": "critical", "icon": f"{UPLOADS_BASE}/products/gallery-15-kesu-1.jpg"},
    {"key": "eggs", "name": "Eggs", "severity": "medium", "icon": f"{UPLOADS_BASE}/information/info-4-baklava.jpg"},
    {"key": "soy", "name": "Soy", "severity": "medium", "icon": f"{UPLOADS_BASE}/products/product-coffee-demo.jpg"},
    {"key": "caffeine", "name": "Caffeine", "severity": "low", "icon": f"{UPLOADS_BASE}/products/gallery-19-kettle-1.jpg"},
]

TAX_CATEGORIES = [
    {"name": "Standard SST", "rate": 0.06},
    {"name": "Zero Rated", "rate": 0.00},
    {"name": "Service Tax", "rate": 0.10},
]

INVENTORY_CATEGORIES = [
    "Coffee Beans", "Dairy", "Syrups", "Bakery", "Packaging", "Equipment", "Merchandise Stock"
]

INVENTORY_ITEMS = {
    "Coffee Beans": [
        {"code": "BEAN-ARA-001", "name": "Arabica Beans 1kg", "uom": "kg", "stock": 50, "reorder": 10, "cost": 28.00},
        {"code": "BEAN-BLD-001", "name": "House Blend 1kg", "uom": "kg", "stock": 40, "reorder": 8, "cost": 22.00},
        {"code": "BEAN-ROB-001", "name": "Robusta Beans 1kg", "uom": "kg", "stock": 30, "reorder": 5, "cost": 18.00},
    ],
    "Dairy": [
        {"code": "DAIRY-MILK-001", "name": "Fresh Milk 1L", "uom": "litre", "stock": 100, "reorder": 20, "cost": 6.50},
        {"code": "DAIRY-CREAM-001", "name": "Whipping Cream 500ml", "uom": "bottle", "stock": 40, "reorder": 10, "cost": 12.00},
    ],
    "Syrups": [
        {"code": "SYRUP-CAR-001", "name": "Caramel Syrup 750ml", "uom": "bottle", "stock": 25, "reorder": 5, "cost": 18.00},
        {"code": "SYRUP-VAN-001", "name": "Vanilla Syrup 750ml", "uom": "bottle", "stock": 20, "reorder": 5, "cost": 16.00},
        {"code": "SYRUP-GULA-001", "name": "Gula Melaka Syrup 500ml", "uom": "bottle", "stock": 15, "reorder": 3, "cost": 14.00},
    ],
    "Bakery": [
        {"code": "BAKE-CRO-001", "name": "Croissant (frozen)", "uom": "piece", "stock": 60, "reorder": 15, "cost": 2.50},
        {"code": "BAKE-MUF-001", "name": "Muffin Mix 2kg", "uom": "bag", "stock": 20, "reorder": 5, "cost": 25.00},
    ],
    "Packaging": [
        {"code": "PACK-CUP-001", "name": "Paper Cup 12oz (100pcs)", "uom": "sleeve", "stock": 200, "reorder": 50, "cost": 15.00},
        {"code": "PACK-LID-001", "name": "Cup Lids (100pcs)", "uom": "sleeve", "stock": 200, "reorder": 50, "cost": 8.00},
    ],
    "Equipment": [
        {"code": "EQUIP-FIL-001", "name": "Water Filters", "uom": "piece", "stock": 10, "reorder": 2, "cost": 45.00},
    ],
    "Merchandise Stock": [
        {"code": "MERCH-TUM-001", "name": "Loka Tumbler", "uom": "piece", "stock": 30, "reorder": 10, "cost": 22.00},
        {"code": "MERCH-POU-001", "name": "Loka Pouch", "uom": "piece", "stock": 40, "reorder": 10, "cost": 12.00},
    ],
}

SUPPLIERS = [
    {"name": "Beans & Co Sdn Bhd", "contact": "Ahmad", "phone": "+60312345678", "email": "ahmad@beansco.my"},
    {"name": "Dairy Fresh Malaysia", "contact": "Sarah Lim", "phone": "+60387654321", "email": "sarah@dairyfresh.my"},
    {"name": "Packaging World KL", "contact": "Rajesh", "phone": "+60323456789", "email": "raj@packworld.my"},
]

STAFF = [
    {"name": "Ahmad Razif", "email": "hq_mgr@lokaespresso.my", "phone": "+60110001001", "role": "regional_manager", "store_id": 1},
    {"name": "Syed Faris", "email": "mgr_klcc@lokaespresso.my", "phone": "+60110002001", "role": "store_manager", "store_id": 2},
    {"name": "Danial Hakim", "email": "astmgr_klcc@lokaespresso.my", "phone": "+60110002002", "role": "shift_supervisor", "store_id": 2},
    {"name": "Ainul Mardhiyah", "email": "staff_klcc_1@lokaespresso.my", "phone": "+60110002011", "role": "kitchen_staff", "store_id": 2},
    {"name": "Buddhi Nair", "email": "staff_klcc_2@lokaespresso.my", "phone": "+60110002012", "role": "cashier", "store_id": 2},
    {"name": "Zara Lee", "email": "mgr_pavilion@lokaespresso.my", "phone": "+60110003001", "role": "store_manager", "store_id": 3},
    {"name": "Fikri Haikal", "email": "mgr_cheras@lokaespresso.my", "phone": "+60110004001", "role": "store_manager", "store_id": 4},
    {"name": "Hanis Nabilah", "email": "mgr_pj@lokaespresso.my", "phone": "+60110005001", "role": "store_manager", "store_id": 5},
    {"name": "Irfan Zulkifli", "email": "mgr_bangi@lokaespresso.my", "phone": "+60110006001", "role": "store_manager", "store_id": 6},
]

CUSTOMERS = [
    {"name": "Sarah Tan", "email": "sarah.tan@test.my", "phone": "+60123456789"},
    {"name": "Raj Kumar", "email": "raj.kumar@test.my", "phone": "+60129876543"},
    {"name": "Mei Wong", "email": "mei.wong@test.my", "phone": "+60123459876"},
    {"name": "Aida Rahman", "email": "aida.rahman@test.my", "phone": "+60127654321"},
    {"name": "Wei Chen", "email": "wei.chen@test.my", "phone": "+60123456780"},
    {"name": "Nina Lim", "email": "nina.lim@test.my", "phone": "+60129876000"},
    {"name": "David Ong", "email": "david.ong@test.my", "phone": "+60123451234"},
    {"name": "Yuna Lee", "email": "yuna.lee@test.my", "phone": "+60127654000"},
    {"name": "Kai Tan", "email": "kai.tan@test.my", "phone": "+60123459870"},
    {"name": "Luna Ng", "email": "luna.ng@test.my", "phone": "+60129876500"},
]

TABLES = {
    2: ["A1", "A2", "B1", "B2", "C1", "C2"],
    3: ["A1", "A2", "B1", "B2", "C1", "C2"],
    4: ["A1", "A2", "B1", "B2", "C1"],
    5: ["A1", "A2", "B1", "B2", "C1"],
    6: ["A1", "A2", "B1", "B2"],
}

# ── Helpers ──────────────────────────────────────────────────────────

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


# ── Seed functions ───────────────────────────────────────────────────

def seed_stores():
    print_header("SEED: Stores")
    resp = api_get("/admin/stores")
    if resp.status_code != 200:
        print(f"[WARN] Could not list stores: {resp.status_code}")
        existing = []
    else:
        data = resp.json().get("data", {})
        existing = data.get("items", []) if isinstance(data, dict) else []
    existing_slugs = {s.get("slug") for s in existing}

    created = 0
    for store in STORES:
        if store["slug"] in existing_slugs:
            print(f"  [SKIP] {store['store_name']} already exists")
            continue
        resp = api_post("/admin/stores", json=store)
        if resp.status_code in (200, 201):
            print(f"  [OK] Created {store['store_name']} (id={resp.json().get('data', {}).get('id')})")
            created += 1
        else:
            print(f"  [FAIL] {store['store_name']}: {resp.status_code} {resp.text[:120]}")
    print(f"\n  Stores: {created} created, {len(existing)} already existed")
    return created


def seed_dining_tables():
    print_header("SEED: Dining Tables")
    resp = api_get("/admin/stores")
    if resp.status_code != 200:
        print("[FAIL] Cannot list stores")
        return 0
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    physical_stores = [s for s in stores if s.get("slug") != "hq"]

    created = 0
    for store in physical_stores:
        store_id = store["id"]
        tables_resp = api_get(f"/admin/stores/{store_id}/tables")
        existing = []
        if tables_resp.status_code == 200:
            tdata = tables_resp.json().get("data", [])
            existing = tdata if isinstance(tdata, list) else []
        existing_nums = {t.get("table_number") for t in existing}

        table_list = TABLES.get(store_id, ["A1", "A2", "B1", "B2"])
        for tnum in table_list:
            if tnum in existing_nums:
                continue
            capacity = 8 if "C" in tnum else (6 if "B" in tnum else 4)
            resp = api_post(f"/admin/stores/{store_id}/tables", json={
                "table_number": tnum,
                "capacity": capacity,
            })
            if resp.status_code in (200, 201):
                created += 1
            else:
                print(f"  [FAIL] Table {tnum} for store {store_id}: {resp.status_code}")
        print(f"  [OK] Store {store['store_name']}: {len(table_list)} tables")
    print(f"\n  Tables: {created} created")
    return created


def seed_menu_categories():
    print_header("SEED: Menu Categories")
    resp = api_get("/admin/stores")
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    hq_store = next((s for s in stores if s.get("slug") == "hq"), None)
    if not hq_store:
        print("[FAIL] HQ store not found, cannot seed menu categories")
        return 0
    hq_id = hq_store["id"]

    resp = api_get("/admin/menu/categories", params={"store_id": hq_id})
    existing = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing = data if isinstance(data, list) else []
    existing_slugs = {c.get("slug") for c in existing}

    created = 0
    for i, cat in enumerate(MENU_CATEGORIES, 1):
        if cat["slug"] in existing_slugs:
            print(f"  [SKIP] {cat['name']} already exists")
            continue
        payload = {
            "store_id": hq_id,
            "category_name": cat["name"],
            "slug": cat["slug"],
            "description": f"Delicious {cat['name'].lower()} selections",
            "display_order": i,
            "image_url": cat["image_url"],
            "is_available": True,
            "is_featured": i <= 3,
        }
        resp = api_post("/admin/menu/categories", json=payload)
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {cat['name']}")
        else:
            print(f"  [FAIL] {cat['name']}: {resp.status_code} {resp.text[:120]}")
    print(f"\n  Categories: {created} created")
    return created


def seed_menu_items():
    print_header("SEED: Menu Items")
    resp = api_get("/admin/stores")
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    hq_store = next((s for s in stores if s.get("slug") == "hq"), None)
    if not hq_store:
        print("[FAIL] HQ store not found")
        return 0
    hq_id = hq_store["id"]

    resp = api_get("/admin/menu/categories", params={"store_id": hq_id})
    cats_data = resp.json().get("data", [])
    cats = cats_data if isinstance(cats_data, list) else []
    cat_map = {c["category_name"]: c["id"] for c in cats}

    resp = api_get("/admin/menu/items", params={"store_id": hq_id, "available_only": "false"})
    existing_items = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing_items = data if isinstance(data, list) else []
    existing_names = {it.get("item_name") for it in existing_items}

    created = 0
    for cat_name, items in MENU_ITEMS.items():
        cat_id = cat_map.get(cat_name)
        if not cat_id:
            print(f"  [WARN] Category '{cat_name}' not found, skipping items")
            continue
        for j, item in enumerate(items, 1):
            if item["name"] in existing_names:
                continue
            payload = {
                "store_id": hq_id,
                "category_id": cat_id,
                "item_code": f"ITEM-{uuid.uuid4().hex[:6].upper()}",
                "item_name": item["name"],
                "description": item["desc"],
                "base_price": item["price"],
                "cost_price": round(item["price"] * 0.35, 2),
                "image_url": item["image"],
                "is_available": True,
                "is_featured": item["featured"],
                "is_popular": item["featured"],
                "display_order": j,
                "prep_time_minutes": 5,
                "calories": random.randint(80, 450),
            }
            resp = api_post("/admin/menu/items", json=payload)
            if resp.status_code in (200, 201):
                created += 1
            else:
                print(f"  [FAIL] {item['name']}: {resp.status_code} {resp.text[:120]}")
        print(f"  [OK] {cat_name}: {len(items)} items")
    print(f"\n  Menu items: {created} created")
    return created


def seed_allergens():
    print_header("SEED: Allergens")
    # Try to list allergens - if endpoint fails, check via direct DB is not possible
    # so we just try to create and catch 409/500 for duplicates
    existing_keys = set()

    created = 0
    for allergen in ALLERGENS:
        if allergen["key"] in existing_keys:
            print(f"  [SKIP] {allergen['name']} already exists")
            continue
        resp = api_post("/admin/menu/allergens", json={
            "allergen_key": allergen["key"],
            "display_name": allergen["name"],
            "description": f"Contains {allergen['name'].lower()}",
            "icon_url": allergen["icon"],
            "severity": allergen["severity"],
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {allergen['name']}")
        else:
            print(f"  [FAIL] {allergen['name']}: {resp.status_code}")
    print(f"\n  Allergens: {created} created")
    return created


def seed_tax_categories():
    print_header("SEED: Tax Categories")
    resp = api_get("/admin/stores")
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    hq_store = next((s for s in stores if s.get("slug") == "hq"), None)
    if not hq_store:
        print("[FAIL] HQ store not found")
        return 0
    hq_id = hq_store["id"]

    resp = api_get("/admin/menu/tax-categories", params={"store_id": hq_id})
    existing = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing = data if isinstance(data, list) else []
    existing_names = {t.get("category_name") for t in existing}

    created = 0
    for tax in TAX_CATEGORIES:
        if tax["name"] in existing_names:
            print(f"  [SKIP] {tax['name']} already exists")
            continue
        resp = api_post("/admin/menu/tax-categories", json={
            "store_id": hq_id,
            "category_name": tax["name"],
            "rate": tax["rate"],
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {tax['name']} @ {tax['rate']*100:.0f}%")
        else:
            print(f"  [FAIL] {tax['name']}: {resp.status_code}")
    print(f"\n  Tax categories: {created} created")
    return created


def seed_inventory():
    print_header("SEED: Inventory")
    resp = api_get("/admin/stores")
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    hq_store = next((s for s in stores if s.get("slug") == "hq"), None)
    if not hq_store:
        print("[FAIL] HQ store not found")
        return 0
    hq_id = hq_store["id"]

    # Categories
    resp = api_get("/admin/inventory/categories", params={"store_id": hq_id})
    existing_cats = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing_cats = data if isinstance(data, list) else []
    existing_cat_names = {c.get("category_name") for c in existing_cats}

    cat_id_map = {}
    for i, name in enumerate(INVENTORY_CATEGORIES, 1):
        if name in existing_cat_names:
            cat_id = next(c["id"] for c in existing_cats if c.get("category_name") == name)
            cat_id_map[name] = cat_id
            continue
        resp = api_post("/admin/inventory/categories", json={
            "store_id": hq_id,
            "category_name": name,
            "description": f"Inventory category: {name}",
            "display_order": i,
        })
        if resp.status_code in (200, 201):
            cat_id_map[name] = resp.json()["data"]["id"]
            print(f"  [OK] Category: {name}")
        else:
            print(f"  [FAIL] Category {name}: {resp.status_code}")

    # Items
    resp = api_get("/admin/inventory/items", params={"store_id": hq_id})
    existing_items = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing_items = data if isinstance(data, list) else []
    existing_codes = {it.get("item_code") for it in existing_items}

    items_created = 0
    for cat_name, items in INVENTORY_ITEMS.items():
        cat_id = cat_id_map.get(cat_name)
        if not cat_id:
            continue
        for item in items:
            if item["code"] in existing_codes:
                continue
            resp = api_post("/admin/inventory/items", json={
                "store_id": hq_id,
                "category_id": cat_id,
                "item_code": item["code"],
                "item_name": item["name"],
                "description": item["name"],
                "unit_of_measure": item["uom"],
                "current_stock": item["stock"],
                "reorder_level": item["reorder"],
                "unit_cost": item["cost"],
                "is_active": True,
            })
            if resp.status_code in (200, 201):
                items_created += 1
            else:
                print(f"  [FAIL] Item {item['name']}: {resp.status_code}")
        print(f"  [OK] {cat_name}: {len(items)} items")

    # Suppliers
    resp = api_get("/admin/inventory/suppliers", params={"store_id": hq_id})
    existing_supps = []
    if resp.status_code == 200:
        data = resp.json().get("data", [])
        existing_supps = data if isinstance(data, list) else []
    existing_supp_names = {s.get("supplier_name") for s in existing_supps}

    supps_created = 0
    for supp in SUPPLIERS:
        if supp["name"] in existing_supp_names:
            continue
        resp = api_post("/admin/inventory/suppliers", json={
            "store_id": hq_id,
            "supplier_name": supp["name"],
            "contact_person": supp["contact"],
            "phone_number": supp["phone"],
            "email_address": supp["email"],
            "is_active": True,
        })
        if resp.status_code in (200, 201):
            supps_created += 1
            print(f"  [OK] Supplier: {supp['name']}")
        else:
            print(f"  [FAIL] Supplier {supp['name']}: {resp.status_code}")

    print(f"\n  Inventory: {len(cat_id_map)} categories, {items_created} items, {supps_created} suppliers")
    return items_created


def seed_staff():
    print_header("SEED: Staff")
    created = 0
    for staff in STAFF:
        store_id = staff["store_id"]
        resp = api_get(f"/admin/staff", params={"store_id": store_id, "per_page": 100})
        existing = []
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            existing = data.get("items", []) if isinstance(data, dict) else []
        existing_emails = {s.get("email_address") for s in existing}
        if staff["email"] in existing_emails:
            print(f"  [SKIP] {staff['name']} already exists")
            continue
        resp = api_post("/admin/staff", json={
            "store_id": store_id,
            "employee_id": f"EMP-{uuid.uuid4().hex[:6].upper()}",
            "display_name": staff["name"],
            "email_address": staff["email"],
            "phone_number": staff["phone"],
            "role": staff["role"],
            "hire_date": str(date.today()),
            "is_active": True,
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {staff['name']} ({staff['role']}) @ store {store_id}")
        else:
            print(f"  [FAIL] {staff['name']}: {resp.status_code} {resp.text[:120]}")
    print(f"\n  Staff: {created} created")
    return created


def seed_customers():
    print_header("SEED: Customers")
    created = 0
    for cust in CUSTOMERS:
        # Check if exists by email
        resp = api_post("/auth/login", json={"email_address": cust["email"]})
        if resp.status_code == 200:
            print(f"  [SKIP] {cust['name']} already exists")
            continue
        # Register
        resp = api_post("/auth/register", json={
            "email_address": cust["email"],
            "phone_number": cust["phone"],
            "display_name": cust["name"],
            "password": "password123",
        })
        if resp.status_code in (200, 201):
            created += 1
            print(f"  [OK] {cust['name']}")
        else:
            # Try login again (might already exist)
            resp2 = api_post("/auth/login", json={"email_address": cust["email"]})
            if resp2.status_code == 200:
                print(f"  [SKIP] {cust['name']} already exists")
            else:
                print(f"  [FAIL] {cust['name']}: {resp.status_code} {resp.text[:120]}")
    print(f"\n  Customers: {created} created")
    return created


def seed_orders_and_payments():
    print_header("SEED: Orders & Payments")
    # Get customers
    customer_tokens = []
    for cust in CUSTOMERS:
        resp = api_post("/auth/login", json={"email_address": cust["email"]})
        if resp.status_code == 200:
            token = resp.json().get("tokens", {}).get("access_token")
            if token:
                customer_tokens.append(token)

    if not customer_tokens:
        print("[WARN] No customers could log in, skipping orders")
        return 0

    # Get stores
    resp = api_get("/stores")
    if resp.status_code != 200:
        print("[WARN] Cannot list stores")
        return 0
    stores_data = resp.json().get("data", {})
    stores = stores_data.get("items", []) if isinstance(stores_data, dict) else []
    physical_stores = [s for s in stores if s.get("slug") != "hq"]
    if not physical_stores:
        print("[WARN] No physical stores found")
        return 0

    # Get menu items
    # Get menu items from first physical store
    store = physical_stores[0]
    resp = api_get(f"/menu/stores/{store['id']}")
    if resp.status_code != 200:
        print(f"[WARN] Cannot list menu items: {resp.status_code}")
        return 0
    menu_data = resp.json().get("data", {})
    items = menu_data.get("items", []) if isinstance(menu_data, dict) else []
    if not items:
        print("[WARN] No menu items found")
        return 0

    created_orders = 0
    created_payments = 0

    for i, token in enumerate(customer_tokens[:5]):  # Seed 5 orders
        store = random.choice(physical_stores)
        store_id = store["id"]

        # Add items to cart
        cart_items = random.sample(items, min(3, len(items)))
        for item in cart_items:
            api_post("/cart/items", token=token, json={
                "store_id": store_id,
                "menu_item_id": item["id"],
                "quantity": random.randint(1, 3),
                "unit_price": item["base_price"],
            })

        # Create order
        order_types = ["dine_in", "takeaway", "delivery"]
        order_type = random.choice(order_types)
        resp = api_post("/orders", token=token, json={
            "store_id": store_id,
            "order_type": order_type,
            "order_channel": "mobile_app",
            "special_instructions": "Please make it extra hot" if random.random() > 0.5 else None,
        })
        if resp.status_code not in (200, 201):
            print(f"  [FAIL] Order creation: {resp.status_code} {resp.text[:120]}")
            continue
        order = resp.json().get("data", {})
        order_id = order.get("id")
        if not order_id:
            continue
        created_orders += 1
        print(f"  [OK] Order #{order_id} ({order_type}) @ {store['store_name']}")

        # Create payment intent
        total = order.get("total_amount", 0)
        if total > 0:
            resp = api_post("/payments/intent", token=token, json={
                "order_id": order_id,
                "provider": random.choice(["stripe", "grabpay", "cash"]),
                "payment_method_type": random.choice(["credit_card", "e_wallet", "cash"]),
            })
            if resp.status_code in (200, 201):
                created_payments += 1
                pay_data = resp.json().get("data", {})
                print(f"    [OK] Payment intent #{pay_data.get('id')}")
            else:
                print(f"    [WARN] Payment intent failed: {resp.status_code}")

    print(f"\n  Orders: {created_orders} created, Payments: {created_payments} created")
    return created_orders


def verify_counts():
    print_header("VERIFICATION: Counts")
    checks = [
        ("/admin/stores", "stores"),
        ("/admin/menu/categories", "menu categories"),
        ("/admin/menu/items", "menu items"),
        ("/admin/menu/allergens", "allergens"),
        ("/admin/menu/tax-categories", "tax categories"),
        ("/admin/inventory/categories", "inventory categories"),
        ("/admin/inventory/items", "inventory items"),
        ("/admin/inventory/suppliers", "suppliers"),
    ]
    for path, name in checks:
        params = {"store_id": 1} if "inventory" in path or "tax" in path or "categories" in path else {}
        if "stores" in path:
            params = {}
        resp = api_get(path, params=params)
        count = 0
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if isinstance(data, dict):
                count = len(data.get("items", []))
            elif isinstance(data, list):
                count = len(data)
        print(f"  {name}: {count}")

    # Staff count
    resp = api_get("/admin/staff", params={"store_id": 1, "per_page": 100})
    if resp.status_code == 200:
        data = resp.json().get("data", {})
        count = len(data.get("items", [])) if isinstance(data, dict) else len(data)
        print(f"  staff (store 1): {count}")

    # Dashboard metrics
    resp = api_get("/admin/dashboard/metrics")
    if resp.status_code == 200:
        metrics = resp.json().get("data", {})
        print(f"  dashboard: stores={metrics.get('total_stores')}, orders={metrics.get('total_orders')}, revenue={metrics.get('today_revenue')}")


def run():
    print("="*60)
    print("  FNB SUPER APP v3 — SAFE SEED SCRIPT")
    print("  API:", API_BASE)
    print("  Admin:", ADMIN_EMAIL)
    print("  SAFETY: No truncate. Idempotent. API-only.")
    print("="*60)

    # Health check
    resp = requests.get(f"{API_BASE}/health", timeout=5)
    if resp.status_code != 200:
        print(f"[ERROR] Backend not healthy: {resp.status_code}")
        sys.exit(1)
    print("[OK] Backend healthy")

    # Verify admin login
    token = get_admin_token()
    print(f"[OK] Admin login successful")

    # Run all seed steps
    seed_stores()
    seed_dining_tables()
    seed_menu_categories()
    seed_menu_items()
    seed_allergens()
    seed_tax_categories()
    seed_inventory()
    seed_staff()
    seed_customers()
    seed_orders_and_payments()
    verify_counts()

    print_header("SEED COMPLETE")
    print("All data seeded safely. No tables were wiped.")
    print(f"API: {API_BASE}")
    print(f"Admin: {ADMIN_EMAIL} / {ADMIN_PASS}")


if __name__ == "__main__":
    run()
