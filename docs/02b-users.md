# Database Schema — Users & Auth

> Part of [02-database-schema.md](02-database-schema.md)

Core user accounts, addresses, device tokens, JWT blacklist, and OTP sessions.

---

## Tables

### `users`
Core user accounts. All authenticated users (customers, store owners, admins, staff).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | Primary key |
| phone | varchar(20) | YES | | Phone number (unique, used for OTP login) |
| email | varchar(255) | YES | | Email (unique, used for password login) |
| name | varchar(255) | YES | | Display name |
| password_hash | varchar(255) | YES | | bcrypt hash |
| user_type_id | integer | NO | 4 | FK→user_types.id (default: Customer) |
| role_id | integer | NO | 6 | FK→roles.id (default: Customer) |
| avatar_url | varchar(500) | YES | | Profile image |
| referral_code | varchar(50) | YES | | Unique referral code |
| referred_by | integer | YES | | FK→users.id |
| is_active | boolean | NO | true | Account status |
| phone_verified | boolean | NO | false | Whether phone was verified via OTP |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** referred_by → users(id), user_type_id → user_types(id), role_id → roles(id)
**Indexes:** phone (unique), email (unique), referral_code (unique)

### `user_addresses`
Saved delivery addresses for customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| label | varchar(100) | NO | | "Home", "Office", etc. |
| address | text | NO | | Full address string |
| lat | numeric(10,7) | YES | | Latitude |
| lng | numeric(10,7) | YES | | Longitude |
| is_default | boolean | NO | false | Default address flag |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id)

### `device_tokens`
Push notification tokens (FCM/APNs).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| token | varchar(500) | NO | | Device push token |
| platform | varchar(20) | YES | | `ios`, `android`, `web` |
| is_active | boolean | NO | true | Active token flag |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id)

### `token_blacklist`
Revoked JWT tokens for proper logout. Checked on every authenticated request.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| jti | varchar(255) | NO | | JWT ID claim (unique) |
| user_id | integer | NO | | FK→users.id |
| expires_at | timestamptz | NO | | When the token naturally expires |
| created_at | timestamptz | YES | now() | When blacklisted |

**FKs:** user_id → users(id)
**Indexes:** jti (unique), user_id

### `otp_sessions`
OTP codes for phone-based authentication.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| phone | varchar(20) | NO | | Target phone number |
| code | varchar(6) | NO | | 6-digit OTP code |
| verified | boolean | NO | false | Whether OTP was verified |
| expires_at | timestamptz | NO | | Expiry timestamp |
| created_at | timestamptz | YES | now() | |

**Indexes:** phone

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Users | 22 | 1 Admin, 3 HQ Staff (seed_04), 7 Store Mgmt (seed_04), 11 Store Staff (seed_04) |

### Admin Login Credentials

| Email | Password | Role | Store Access |
|-------|----------|------|-------------|
| `admin@loyaltysystem.uk` | `admin123` | Admin | Global (superuser) |

### HQ Staff (seed_04)

| Email | Temp Password |
|-------|--------------|
| `hq_mgr_1@fnb.com` | (set on seed) |
| `hq_mgr_2@fnb.com` | (set on seed) |
| `hq_staff_1@fnb.com` | (set on seed) |

### Store Management (seed_04)

| Email | Store |
|-------|-------|
| `mgr_klcc@fnb.com` | Loka Espresso KLCC (id=2) |
| `astmgr_klcc@fnb.com` | Loka Espresso KLCC (id=2) |
| `mgr_pavilion@fnb.com` | Loka Espresso Pavilion (id=3) |
| `astmgr_pavilion@fnb.com` | Loka Espresso Pavilion (id=3) |
| `mgr_cheras@fnb.com` | Loka Espresso Cheras (id=4) |
| `mgr_pj@fnb.com` | Loka Espresso PJ (id=5) |
| `mgr_bangi@fnb.com` | Loka Espresso Bangi (id=6) |

### Store Staff (seed_04)

| Email | Store |
|-------|-------|
| `staff_klcc_1@fnb.com` | Loka Espresso KLCC (id=2) |
| `staff_klcc_2@fnb.com` | Loka Espresso KLCC (id=2) |
| `staff_klcc_3@fnb.com` | Loka Espresso KLCC (id=2) |
| `staff_pavilion_1@fnb.com` | Loka Espresso Pavilion (id=3) |
| `staff_pavilion_2@fnb.com` | Loka Espresso Pavilion (id=3) |
| `staff_cheras_1@fnb.com` | Loka Espresso Cheras (id=4) |
| `staff_cheras_2@fnb.com` | Loka Espresso Cheras (id=4) |
| `staff_pj_1@fnb.com` | Loka Espresso PJ (id=5) |
| `staff_bangi_1@fnb.com` | Loka Espresso Bangi (id=6) |
| `staff_bangi_2@fnb.com` | Loka Espresso Bangi (id=6) |
| `staff_bangi_3@fnb.com` | Loka Espresso Bangi (id=6) |
