# Database Schema — Staff & Shifts

> Part of [02-database-schema.md](02-database-schema.md)

Staff member records, clock-in/out shift tracking, and PIN-based rate limiting.

> **Phase 19 (2026-04-28):** `staff.user_id` FK updated from `users.id` to `admin_users.id`. Staff records link to `AdminUser` accounts (not the legacy `users` table). An `admin_user_id` column also exists in the DB as a redundant FK added by migration.

---

## Tables

### `staff`
Staff members at stores. PER-STORE. Same user can have records at multiple stores. `store_id=0` means HQ (no specific store).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→admin_users.id (links to admin login account) |
| store_id | integer | YES | 0 | FK→stores.id (nullable for HQ staff, 0=HQ) |
| name | varchar(255) | NO | | Staff name |
| email | varchar(255) | YES | | Staff email |
| phone | varchar(20) | YES | | Staff phone |
| role | staffrole | NO | | `manager`, `assistant_manager`, `barista`, `cashier`, `delivery` |
| is_active | boolean | NO | true | |
| pin_code | varchar(10) | YES | | PIN for clock-in/out |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), store_id → stores(id)
**Unique:** (store_id, user_id) WHERE user_id IS NOT NULL — partial unique index

### `staff_shifts`
Clock-in/out records.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| staff_id | integer | NO | | FK→staff.id |
| store_id | integer | NO | | FK→stores.id |
| clock_in | timestamptz | NO | | Clock-in time |
| clock_out | timestamptz | YES | | Clock-out time (null = still on shift) |
| notes | text | YES | | Shift notes |
| created_at | timestamptz | YES | now() | |

**FKs:** staff_id → staff(id), store_id → stores(id)

### `pin_attempts`
Database-backed PIN rate limiting.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| staff_id | integer | NO | | FK→staff.id (ON DELETE CASCADE) |
| attempted_at | timestamptz | NO | now() | When the attempt occurred |

**FKs:** staff_id → staff(id) ON DELETE CASCADE

**Rate limit rule:** Max 5 attempts per 5 minutes per staff_id.

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Staff | 21 | 3 HQ (user_type=1), 7 Store Management (user_type=2), 11 Store Staff (user_type=3) |

Credentials: See [02b-users.md](02b-users.md) — staff users are created via seed_04_staff.py and logged in via `POST /auth/login-password`.
