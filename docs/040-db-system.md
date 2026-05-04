# Database Schema — System Config

> Part of [02-database-schema.md](02-database-schema.md)

Key-value runtime configuration, splash screen content, and immutable audit trail.

---

## System Admin APIs

Two new admin-only system endpoints were added to support the seed infrastructure:

### `POST /admin/system/init-hq`
Creates or confirms the HQ store (id=0). Idempotent — returns existing if already created. The HQ store is the holder of the universal menu and cannot be created via the normal `POST /admin/stores` endpoint (which uses auto-increment).

### `DELETE /admin/system/reset`
Wipes all operational tables in FK-safe order, then re-initializes the HQ store (id=0). Preserves: admin user (id=1), all ACL tables (user_types, roles, permissions, role_user_type, role_permissions, user_store_access). Removed audit logging to avoid session buffer conflicts.

### `POST /admin/system/backfill-inventory-ledger`
Backfills missing `inventory_movements` entries for existing inventory items. Creates a `received` movement for each item using its current_stock as opening balance. Idempotent — only creates entries for items that have no ledger history. Use after a reset that preserved inventory but lost ledger entries.

---

## Tables

### `app_config`
Key-value runtime configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| key | varchar(100) | NO | | Unique config key |
| value | text | YES | | Config value (JSON for complex) |
| updated_at | timestamptz | YES | | |

**Unique:** key

### `splash_content`
App splash screen configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| image_url | varchar(500) | YES | | Splash image |
| title | varchar(255) | YES | | Splash title |
| subtitle | varchar(255) | YES | | Sub-text |
| cta_text | varchar(100) | YES | | Button text |
| cta_url | varchar(500) | YES | | Button URL |
| dismissible | boolean | NO | true | Can be dismissed |
| active_from | timestamptz | YES | | Start showing |
| active_until | timestamptz | YES | | Stop showing |
| is_active | boolean | NO | false | |
| fallback_title | varchar(255) | YES | 'Coffee App' | Fallback when inactive |
| fallback_subtitle | varchar(255) | YES | | Fallback subtitle |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### `audit_log`
Immutable audit trail for all significant actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→users.id |
| store_id | integer | YES | | FK→stores.id |
| action | varchar(100) | NO | | Action name |
| entity_type | varchar(100) | YES | | Entity type |
| entity_id | integer | YES | | Entity ID |
| details | json | YES | | Additional details |
| ip_address | varchar(45) | YES | | Client IP |
| status | varchar(20) | YES | success | Action result |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), store_id → stores(id)
**Indexes:** action, user_id, store_id, created_at
