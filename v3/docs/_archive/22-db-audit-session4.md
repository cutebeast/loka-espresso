# DB Audit — Session 4 (April 26, 2026)

## Models Fixed

| Issue | Status | Detail |
|-------|--------|--------|
| CartItem missing `store_id` | Fixed | FK to `stores.id`, model + migration aligned |
| device_tokens.token 500→4096 | Fixed | Model now `String(4096)`, matches migration |
| checkout_tokens.reward_id FK | Fixed | FK added to migration `6b92efcd789d` |
| staff.store_rel → staff.store | Fixed | Renamed |

## New Tables Added (compliance.py)

| Table | Purpose |
|-------|---------|
| `modifier_groups` | Groups of modifier options for menu item customization |
| `modifier_options` | Individual add-on choices linked to modifier groups |
| `allergens` | Food allergen definitions (milk, nuts, gluten, etc.) |
| `menu_item_allergens` | M2M link between menu items and allergens |
| `delivery_zones` | Geo-fenced delivery zones with polygon/postcode coverage |
| `tax_rates` | Tax rate definitions by category |

## Pending Tables (NOW ADDED)

| Table | Status |
|-------|--------|
| `tax_categories` | Added in migration `7c34ab5e1234` |
| `recipe_items` | Added in migration `7c34ab5e1234` |
| `reservations` | Added in migration `7c34ab5e1234` |

## Current State

- Total tables: 63 (up from 54 in Session 3)
- Total FKs: 95+ (up from 85+)
- Triggers: 1 (`trg_order_status_occupancy`)
- Single baseline migration: `5a81abc564c3`
- Active migrations: `6b92efcd789d` (customization JSON → normalized), `7c34ab5e1234` (new tables)
