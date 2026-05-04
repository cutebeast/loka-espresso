# Database Schema — Menu & Inventory

> Part of [02-database-schema.md](02-database-schema.md)

Menu categories, menu items, customization options, inventory categories, inventory items, and inventory movements.

---

## Tables

### `menu_categories`
Menu sections (Coffee, Non-Coffee, Food). **UNIVERSAL** — managed by HQ, served identically to all physical stores.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Category name |
| slug | varchar(100) | YES | | URL-safe slug |
| display_order | integer | YES | 0 | Sort order (lowest to highest; 0=unsorted) |
| is_active | boolean | NO | true | |

**No store_id** — menu categories are store-agnostic.

### `menu_items`
Individual menu items. **UNIVERSAL** — managed by HQ, served identically to all physical stores. Supports soft delete via `deleted_at`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| category_id | integer | NO | | FK→menu_categories.id |
| name | varchar(255) | NO | | Item name |
| description | text | YES | | Description |
| base_price | numeric(10,2) | NO | | Base price in RM |
| image_url | varchar(500) | YES | | Item photo |
| customization_options | json | YES | | Legacy JSON add-ons |
| is_available | boolean | NO | true | Currently available |
| is_featured | boolean | NO | false | Show in "Today's recommendations" |
| display_order | integer | YES | 0 | Sort order within category (lowest to highest; 0=unsorted) |
| popularity | integer | YES | 0 | Order count |
| deleted_at | timestamptz | YES | | Soft delete timestamp |

**FKs:** category_id → menu_categories(id)
**Indexes:** `ix_menu_cat_avail` on `(category_id, is_available)`

**No store_id** — menu items are store-agnostic. The `store_id` on `cart_items` and `orders` records the *fulfillment store*, not the menu item's owner.

### `customization_options`
Normalized add-ons for menu items. Enables "revenue from add-ons" reporting.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| menu_item_id | integer | NO | | FK→menu_items.id (ON DELETE CASCADE) |
| name | varchar(100) | NO | | "Extra Shot", "Oat Milk" |
| price_adjustment | numeric(10,2) | NO | 0 | Additional cost |
| is_active | boolean | NO | true | |
| display_order | integer | YES | 0 | Sort order |
| created_at | timestamptz | YES | now() | |

**FKs:** menu_item_id → menu_items(id) ON DELETE CASCADE

### `inventory_categories`
Inventory groupings per store (e.g., Beans, Dairy, Syrups). PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| name | varchar(255) | NO | | Category name (e.g., "Beans") |
| slug | varchar(100) | YES | | URL-safe slug |
| display_order | integer | YES | 0 | Sort order |
| is_active | boolean | NO | true | |

**FKs:** store_id → stores(id)

### `inventory_items`
Stock levels for ingredients/supplies. PER-STORE.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| name | varchar(255) | NO | | "Arabica Beans" |
| current_stock | numeric(10,2) | YES | 0 | Current quantity |
| unit | varchar(50) | YES | | "kg", "litre", "pcs" |
| reorder_level | numeric(10,2) | YES | 0 | Threshold for reorder alert |
| is_active | boolean | NO | true | Active flag |
| category_id | integer | YES | | FK→inventory_categories.id |
| updated_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id), category_id → inventory_categories(id)

### `inventory_movements`
Stock movement log. Tracks all inventory changes (received, waste, transfers, adjustments). Uses `movement_type` enum.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| store_id | integer | NO | | FK→stores.id |
| inventory_item_id | integer | NO | | FK→inventory_items.id |
| movement_type | movement_type | NO | | `received`, `waste`, `transfer_out`, `transfer_in`, `cycle_count`, `adjustment` |
| quantity | numeric(10,2) | NO | | Quantity moved (positive) |
| balance_after | numeric(10,2) | NO | | Stock balance after movement |
| note | text | NO | | Reason/details |
| attachment_path | varchar(500) | YES | | Optional photo/document |
| created_by | integer | NO | | FK→users.id |
| created_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id), inventory_item_id → inventory_items(id), created_by → users(id)
**Indexes:** (store_id, inventory_item_id)

---

## Display Order

Categories and items are ordered by `display_order` ASC (lowest to highest). Default is `0` (unsorted). All GET endpoints automatically sort:
- `GET /menu/categories` → `ORDER BY display_order`
- `GET /menu/items` → `ORDER BY display_order`
- `GET /menu/items/popular` → `ORDER BY display_order`
- `GET /menu/items/search` → `ORDER BY display_order`
- `GET /menu/categories` and `GET /menu/items` → universal menu, ordered by `display_order`

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Menu Categories | 10 | Universal: Signature Coffee, Espresso Bar, Tea & Non-Coffee, Pastries & Toast, Specialties, Iced & Blended, Food & Sandwiches, Desserts, Merchandise, Coffee Beans & Packs |
| Menu Items | 35 | Universal: served identically at all physical stores |
| Inventory Categories | 50 | 10 per physical store (IDs 1–5): Coffee Beans, Milk & Cream, Syrups & Sauces, Tea & Matcha, Bakery Supplies, Packaging, Food Ingredients, Cleaning Supplies, Merchandise Stock, Frozen & Chilled |
| Inventory Items | 300 | ~60 per physical store, one RECEIVED ledger entry per item |
| Inventory Ledger | 300 | Auto-created on inventory item creation (opening stock movement) |
