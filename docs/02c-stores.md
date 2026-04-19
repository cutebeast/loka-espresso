# Database Schema — Stores & Tables

> Part of [02-database-schema.md](02-database-schema.md)

Physical store locations, dine-in tables with QR codes, and real-time occupancy tracking.

---

## Tables

### `stores`
Physical store/outlet locations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Store display name |
| slug | varchar(100) | NO | | URL-safe identifier (unique) |
| address | text | YES | | Physical address |
| lat | numeric(10,7) | YES | | Latitude |
| lng | numeric(10,7) | YES | | Longitude |
| phone | varchar(20) | YES | | Store phone |
| image_url | varchar(500) | YES | | Store photo |
| opening_hours | json | YES | | `{"mon": "08:00-22:00", ...}` |
| pickup_lead_minutes | integer | YES | 15 | Minimum lead time for pickup |
| delivery_radius_km | numeric(5,2) | YES | 5.0 | Max delivery distance |
| is_active | boolean | NO | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Unique:** slug

### `store_tables`
Dine-in tables with QR codes. PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| table_number | varchar(20) | NO | | "A1", "B2", etc. |
| qr_code_url | varchar(500) | YES | | QR code URL |
| capacity | integer | YES | 4 | Seats |
| is_active | boolean | NO | true | |
| is_occupied | boolean | NO | false | Real-time occupancy flag |

**FKs:** store_id → stores(id)

### `table_occupancy_snapshot`
Denormalized real-time occupancy. Auto-updated by trigger.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| table_id | integer | NO | | PK, FK→store_tables.id (ON DELETE CASCADE) |
| store_id | integer | NO | | FK→stores.id |
| is_occupied | boolean | NO | false | Current occupancy |
| current_order_id | integer | YES | | FK→orders.id (ON DELETE SET NULL) |
| updated_at | timestamptz | YES | now() | |

**FKs:** table_id → store_tables(id) ON DELETE CASCADE, store_id → stores(id), current_order_id → orders(id) ON DELETE SET NULL
**Indexes:** (store_id, is_occupied)

**Trigger-updated** by `trg_order_status_occupancy`:
- On order status → `confirmed`/`preparing`: sets `is_occupied=TRUE`
- On order status → `completed`/`cancelled`: sets `is_occupied=FALSE`

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Stores | 6 | id=0 HQ (Headquarters), ids 2-6 physical stores |
| Physical Stores | 5 | Loka Espresso KLCC (id=2, slug=le-klcc), Loka Espresso Pavilion (id=3, slug=le-pavilion), Loka Espresso Cheras (id=4, slug=le-cheras), Loka Espresso PJ (id=5, slug=le-pj), Loka Espresso Bangi (id=6, slug=le-bangi) |
| Tables | ~28 | 4-5 tables + PICKUP counter per store × 5 stores |
