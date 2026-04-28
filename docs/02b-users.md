# Database Schema — Users & Auth

> Part of [02-database-schema.md](02-database-schema.md)

Core user accounts, addresses, device tokens, JWT blacklist, and OTP sessions.

> **Phase 19 (2026-04-28):** The original `users` table has been split into `admin_users` (staff/admin accounts) and `customers` (PWA users). The legacy `users` table still exists for backward compatibility with `OTPSession`, `DeviceToken`, and `TokenBlacklist`. JWT tokens carry a `user_type` claim (`"admin"` or `"customer"`) for polymorphic auth lookups.

---

## Tables

### `admin_users`
Admin/staff login accounts. Used by dashboard and store operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | Primary key |
| email | varchar(255) | YES | | Email (unique, used for password login) |
| name | varchar(255) | YES | | Display name |
| password_hash | varchar(255) | YES | | bcrypt hash |
| phone | varchar(20) | YES | | Phone number |
| user_type_id | integer | NO | 1 | FK→user_types.id |
| role_id | integer | NO | 1 | FK→roles.id |
| is_active | boolean | NO | true | Account status |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** user_type_id → user_types(id), role_id → roles(id)
**Indexes:** email (unique)

### `customers`
PWA customer accounts. Login via OTP.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | Primary key |
| phone | varchar(20) | YES | | Phone number (unique, used for OTP login) |
| email | varchar(255) | YES | | Email (unique) |
| name | varchar(255) | YES | | Display name |
| avatar_url | varchar(500) | YES | | Profile image |
| referral_code | varchar(50) | YES | | Unique referral code |
| referred_by | integer | YES | | FK→customers.id |
| referral_count | integer | NO | 0 | Successful referrals |
| referral_earnings | numeric(10,2) | NO | 0.00 | Referral earnings |
| is_active | boolean | NO | true | Account status |
| phone_verified | boolean | NO | false | Whether phone was verified via OTP |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** referred_by → customers(id)
**Indexes:** phone (unique), email (unique), referral_code (unique)

### `users` (legacy)
⚠️ **LEGACY** — retained for `OTPSession`, `DeviceToken`, and `TokenBlacklist` compatibility. New code uses `admin_users` and `customers` instead.

### `customer_addresses`
Saved delivery addresses for customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| customer_id | integer | NO | | FK→customers.id |
| label | varchar(100) | NO | | "Home", "Office", etc. |
| address | text | NO | | Full address string |
| lat | numeric(10,7) | YES | | Latitude |
| lng | numeric(10,7) | YES | | Longitude |
| is_default | boolean | NO | false | Default address flag |
| created_at | timestamptz | YES | now() | |

**FKs:** customer_id → customers(id)

### `customer_device_tokens`
Push notification tokens for customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| customer_id | integer | NO | | FK→customers.id |
| token | varchar(4096) | NO | | Device push token |
| platform | varchar(20) | YES | | `ios`, `android`, `web` |
| is_active | boolean | NO | true | Active token flag |
| created_at | timestamptz | YES | now() | |

**FKs:** customer_id → customers(id)

### `device_tokens` (legacy)
⚠️ **LEGACY** — replaced by `customer_device_tokens`.

### `token_blacklist`
Revoked JWT tokens for proper logout. Checked on every authenticated request.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| jti | varchar(255) | NO | | JWT ID claim (unique) |
| user_id | integer | NO | | User ID (polymorphic — admin_users or customers) |
| user_type | varchar(20) | YES | | `"admin"` or `"customer"` discriminator |
| expires_at | timestamptz | NO | | When the token naturally expires |
| created_at | timestamptz | YES | now() | When blacklisted |

**Indexes:** jti (unique), user_id, user_type

### `otp_sessions`
OTP codes for phone-based authentication.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| phone | varchar(20) | NO | | Target phone number |
| session_token | varchar(64) | NO | | Unique OTP session identifier |
| code | varchar(6) | NO | | 6-digit OTP code |
| verified | boolean | NO | false | Whether OTP was verified |
| send_count | integer | NO | 1 | Number of sends for this session |
| verify_attempts | integer | NO | 0 | Failed verification attempts |
| resend_available_at | timestamptz | YES | | Next allowed resend time |
| expires_at | timestamptz | NO | | Expiry timestamp |
| verified_at | timestamptz | YES | | When OTP was successfully verified |
| provider | varchar(30) | YES | | OTP delivery provider label (`stub`, future `twilio`) |
| delivery_status | varchar(30) | YES | | Delivery state for audit/debug |
| failure_reason | text | YES | | Last failure/lockout reason |
| created_at | timestamptz | YES | now() | |

**Indexes:** phone, session_token (unique)

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
| `mgr_klcc@fnb.com` | Loka Espresso KLCC (id=1) |
| `astmgr_klcc@fnb.com` | Loka Espresso KLCC (id=1) |
| `mgr_pavilion@fnb.com` | Loka Espresso Pavilion (id=2) |
| `astmgr_pavilion@fnb.com` | Loka Espresso Pavilion (id=2) |
| `mgr_cheras@fnb.com` | Loka Espresso Cheras (id=3) |
| `mgr_pj@fnb.com` | Loka Espresso PJ (id=4) |
| `mgr_bangi@fnb.com` | Loka Espresso Bangi (id=5) |

### Store Staff (seed_04)

| Email | Store |
|-------|-------|
| `staff_klcc_1@fnb.com` | Loka Espresso KLCC (id=1) |
| `staff_klcc_2@fnb.com` | Loka Espresso KLCC (id=1) |
| `staff_klcc_3@fnb.com` | Loka Espresso KLCC (id=1) |
| `staff_pavilion_1@fnb.com` | Loka Espresso Pavilion (id=2) |
| `staff_pavilion_2@fnb.com` | Loka Espresso Pavilion (id=2) |
| `staff_cheras_1@fnb.com` | Loka Espresso Cheras (id=3) |
| `staff_cheras_2@fnb.com` | Loka Espresso Cheras (id=3) |
| `staff_pj_1@fnb.com` | Loka Espresso PJ (id=4) |
| `staff_bangi_1@fnb.com` | Loka Espresso Bangi (id=5) |
| `staff_bangi_2@fnb.com` | Loka Espresso Bangi (id=5) |
| `staff_bangi_3@fnb.com` | Loka Espresso Bangi (id=5) |
