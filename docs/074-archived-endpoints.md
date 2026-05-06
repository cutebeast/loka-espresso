# Archived Endpoints — FNB Super App

> Created: 2026-05-07 | 24 endpoints archived, 8 models deleted

All endpoints below are archived (commented out) with `# ARCHIVED:` markers.
To restore, remove the `# ` prefix from each line.

---

## Archived Endpoints (24)

### Auth
| Method | Path | File | Reason |
|--------|------|------|--------|
| DELETE | `/api/v1/auth/device-token` | `common/auth.py` | No unregister UI in PWA |

### Users
| Method | Path | File | Reason |
|--------|------|------|--------|
| DELETE | `/api/v1/users/me` | `common/users.py` | No account deletion UI |

### Cart
| Method | Path | File | Reason |
|--------|------|------|--------|
| DELETE | `/api/v1/cart` | `pwa/cart.py` | Items deleted individually, never full clear |

### Vouchers
| Method | Path | File | Reason |
|--------|------|------|--------|
| POST | `/api/v1/vouchers/use/{code}` | `common/vouchers.py` | Validate + apply flow used instead |
| DELETE | `/api/v1/vouchers/me/{id}` | `common/vouchers.py` | No delete voucher UI |

### Notifications
| Method | Path | File | Reason |
|--------|------|------|--------|
| PUT | `/api/v1/notifications/read-all` | `common/notifications.py` | Individual mark-read used |

### Tables
| Method | Path | File | Reason |
|--------|------|------|--------|
| GET | `/api/v1/tables/{table_id}` | `common/tables.py` | Table lookup via scan only |
| POST | `/api/v1/tables/{table_id}/release` | `common/tables.py` | No dine-in release UI |

### Upload
| Method | Path | File | Reason |
|--------|------|------|--------|
| GET | `/api/v1/upload/files/{path}` | `common/upload.py` | StaticFiles mount serves `/uploads/` directly |

### Orders
| Method | Path | File | Reason |
|--------|------|------|--------|
| POST | `/api/v1/orders/{id}/pos-synced` | `common/order_webhooks.py` | POS not yet integrated |
| POST | `/api/v1/orders/{id}/delivery-dispatched` | `common/order_webhooks.py` | Delivery not yet integrated |

### Payments
| Method | Path | File | Reason |
|--------|------|------|--------|
| POST | `/api/v1/payments/methods` | `common/payments.py` | No add payment method UI |

### Admin — Menu
| Method | Path | File | Reason |
|--------|------|------|--------|
| DELETE | `/api/v1/admin/categories/{id}` | `admin/admin_menu.py` | Soft-delete via toggle |

### Admin — Stores
| Method | Path | File | Reason |
|--------|------|------|--------|
| DELETE | `/api/v1/admin/stores/{id}` | `admin/admin_stores.py` | No store delete UI |

### Admin — PWA Management
| Method | Path | File | Reason |
|--------|------|------|--------|
| GET | `/api/v1/admin/pwa/version` | `admin/admin_pwa_mgmt.py` | Not wired to UI |

### Admin — Customers
| Method | Path | File | Reason |
|--------|------|------|--------|
| PUT | `/api/v1/admin/customers/{id}` | `admin/admin_customer_actions.py` | No edit customer UI |
| DELETE | `/api/v1/admin/customers/reset` | `admin/admin_customer_actions.py` | No caller, dangerous operation |

### Admin — Feedback
| Method | Path | File | Reason |
|--------|------|------|--------|
| POST | `/api/v1/admin/feedback/{id}/reply` | `admin/admin_feedback.py` | PUT variant is used |
| POST | `/api/v1/admin/feedback` | `admin/admin_feedback.py` | Feedback via PWA only |
| PUT | `/api/v1/admin/feedback/{id}` | `admin/admin_feedback.py` | Not in UI |
| DELETE | `/api/v1/admin/feedback/{id}` | `admin/admin_feedback.py` | Not in UI |

### Admin — Reports
| Method | Path | File | Reason |
|--------|------|------|--------|
| GET | `/api/v1/admin/export` | `admin/admin_reports_store.py` | Not wired to UI |
| GET | `/api/v1/admin/reports/marketing/paginated` | `admin/admin_reports.py` | Un-paginated `/reports/marketing` used |

### Admin — Orders
| Method | Path | File | Reason |
|--------|------|------|--------|
| PATCH | `/api/v1/admin/orders/{id}/delivery-tracking` | `admin/admin_dashboard.py` | Not in UI |

---

## Deleted Models (8)

Removed from `models/compliance.py` entirely:

| Model | DB Table | Replaced By |
|-------|----------|-------------|
| Allergen | `allergens` | `MenuItem.dietary_tags` (JSON) |
| MenuItemAllergen | `menu_item_allergens` | Same as above |
| ModifierGroup | `modifier_groups` | `CustomizationOption` (marketing.py) |
| ModifierOption | `modifier_options` | `CustomizationOption` (marketing.py) |
| DeliveryZone | `delivery_zones` | `Store.delivery_radius_km` |
| TaxRate | `tax_rates` | Not yet implemented |
| TaxCategory | `tax_categories` | Not yet implemented |
| RecipeItem | `recipe_items` | Not yet implemented |
| Reservation | `reservations` | Will rebuild when needed |

---

## Endpoint Stats

| Category | Before | After | Removed |
|----------|:------:|:-----:|:-------:|
| Total endpoints | 244 | 220 | 24 |
| Orphaned models deleted | 9 | 0 | 9 |
| Dead endpoints archived | 24 | 0 | 24 |
| Truly active | ~190 | ~190 | — |
