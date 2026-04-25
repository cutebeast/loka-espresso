# Database Schema — Access Control (ACL)

> Part of [02-database-schema.md](02-database-schema.md)

ACL system using lookup tables instead of enum-based roles. Provides granular permissions, role-to-user-type mapping, and per-user store scoping.

---

## Tables

### `user_types`
User classification lookup table. Determines the broad category of user (HQ, Store Mgmt, Store, Customer).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | manual | Primary key (manually assigned) |
| name | varchar(50) | NO | | Unique type name |
| description | text | YES | | Human-readable description |

**Unique:** name

### `roles`
Role definitions. Each role maps to a typical user type and carries a set of permissions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | manual | Primary key (manually assigned) |
| name | varchar(50) | NO | | Unique role name |
| typical_user_type_id | integer | YES | | FK→user_types.id |

**FKs:** typical_user_type_id → user_types(id)

### `role_user_type`
Many-to-many mapping between roles and user types. A role may be valid for multiple user types.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| role_id | integer | NO | | FK→roles.id |
| user_type_id | integer | NO | | FK→user_types.id |

**PK:** (role_id, user_type_id)
**FKs:** role_id → roles(id), user_type_id → user_types(id)

### `user_store_access`
Per-user store scoping. Determines which stores a user can access in the dashboard. HQ-level users (Admin, Brand Owner) typically have global access and may not have rows here.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| user_id | integer | NO | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| assigned_at | timestamptz | YES | now() | When access was granted |
| assigned_by | integer | YES | | FK→users.id (who granted access) |
| is_primary | boolean | YES | false | Primary store flag |

**PK:** (user_id, store_id)
**FKs:** user_id → users(id), store_id → stores(id), assigned_by → users(id)
**Indexes:** ix_user_store_access_user (user_id), ix_user_store_access_store (store_id)

### `permissions`
Granular permission definitions. Each permission has a resource and action.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | Primary key |
| name | varchar(100) | NO | | Unique permission name |
| resource | varchar(50) | NO | | Target resource (dashboard, order, menu, etc.) |
| action | varchar(50) | NO | | Action type (view, create, update, delete, adjust) |

**Unique:** name

### `role_permissions`
Many-to-many mapping between roles and permissions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| role_id | integer | NO | | FK→roles.id |
| permission_id | integer | NO | | FK→permissions.id |

**PK:** (role_id, permission_id)
**FKs:** role_id → roles(id), permission_id → permissions(id)

---

## Seeded Data

### user_types (4 rows)

| id | name | description |
|----|------|-------------|
| 1 | HQ Management | Corporate office users |
| 2 | Store Management | Area/regional managers, assistants |
| 3 | Store | In-store staff |
| 4 | Customer | End users |

### roles (7 rows)

| id | name | typical_user_type_id |
|----|------|---------------------|
| 1 | Admin | 1 |
| 2 | Brand Owner | 1 |
| 3 | Manager | 2 |
| 4 | Assistant Manager | 2 |
| 5 | Staff | 3 |
| 6 | Customer | 4 |
| 7 | HQ Staff | 1 |

### role_user_type (7 rows)

| role_id | user_type_id |
|---------|-------------|
| 1 | 1 |
| 2 | 1 |
| 3 | 2 |
| 4 | 2 |
| 5 | 3 |
| 6 | 4 |
| 7 | 1 |

### permissions (23 rows)

| id | name | resource | action |
|----|------|----------|--------|
| 1 | view_dashboard | dashboard | view |
| 2 | manage_users | user | create,update,delete |
| 3 | view_sales | sales | view |
| 4 | manage_orders | order | view,update |
| 5 | view_orders | order | view |
| 6 | manage_menu | menu | create,update,delete |
| 7 | view_menu | menu | view |
| 8 | manage_inventory | inventory | create,update,delete |
| 9 | adjust_inventory | inventory | adjust |
| 10 | view_inventory | inventory | view |
| 11 | manage_marketing | marketing | create,update,delete |
| 12 | view_marketing | marketing | view |
| 13 | manage_tables | tables | create,update,delete |
| 14 | view_tables | tables | view |
| 15 | manage_rewards | rewards | create,update,delete |
| 16 | view_reports | reports | view |
| 17 | manage_settings | settings | create,update |
| 18 | view_audit_log | audit | view |
| 19 | manage_vouchers | vouchers | create,update,delete |
| 20 | manage_promotions | promotions | create,update,delete |
| 21 | view_customers | customers | view |
| 22 | manage_notifications | notifications | create,update,delete |
| 23 | manage_loyalty_rules | loyalty_rules | create,update |

### role_permissions (83 rows)

- **Admin (1)** + **Brand Owner (2)**: ALL 23 permissions each (46 rows)
- **HQ Staff (7)**: permissions 1, 2, 4, 5, 7, 10, 3, 16, 21, 12, 6, 8 (12 rows)
- **Manager (3)** + **Assistant Manager (4)**: permissions 1, 4, 5, 7, 9, 10, 13, 14, 3, 16, 21 (22 rows × 2 = 22 rows)
- **Staff (5)**: permissions 1, 4, 5 (3 rows)
- **Customer (6)**: no permissions

### user_store_access (8 rows)

Scoped store assignments for store-level users (HQ users have global access, no rows needed).

---

### Admin Frontend Page Visibility

Page visibility is controlled by `user_type_id` in the admin frontend `Sidebar.tsx`:

| user_type_id | Pages |
|---|---|
| 1 (HQ Management) | All pages |
| 2 (Store Management) | Dashboard, Orders, Kitchen, Menu, Inventory, Tables, Staff, Wallet Top-Up, POS, Customers, Rewards, Vouchers, Reports |
| 3 (Store / Service Crew) | Orders, Kitchen, Wallet Top-Up, POS Terminal, Tables |

Service crew access the admin dashboard from mobile via `MobileBottomNav` (5 tabs: Orders, Station, POS, Tables, Wallet). The POS Terminal and Tables pages have mobile-responsive CSS overrides.

---

## Notes

- The `users` table references `user_types.id` and `roles.id` via `user_type_id` and `role_id` FK columns (see [02b-users.md](02b-users.md)).
- Permission checks use the `require_permission("resource:action")` dependency which resolves user → role → permissions.
- `user_store_access` is checked by the `get_user_store_ids()` dependency to scope dashboard queries to the user's assigned stores.
- Tables endpoints use `require_store_access` (not role permissions) — service crew can view/manage tables for stores they're assigned to.
