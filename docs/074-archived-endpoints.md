# Endpoint Cleanup — FNB Super App

> Updated: 2026-05-07 | Verified against `050-api-reference.md`

---

## Removed Endpoints (2)

These were removed after confirming zero callers anywhere in the codebase or documentation:

| Method | Path | File | Verification |
|--------|------|------|-------------|
| POST | `/api/v1/admin/feedback` | `admin/admin_feedback.py` | Not in `050-api-reference.md`. PWA creates feedback (`POST /feedback`), admin never creates feedback. Confirmed zero frontend/PWA calls. |
| GET | `/api/v1/admin/export` | `admin/admin_reports_store.py` | Not in `050-api-reference.md`. CSV export via `GET /admin/reports/csv` was wired to SalesReportsPage (commit `2bfb689`). Confirmed zero callers. |

---

## Deleted Models (9 from compliance.py)

All removed in commit `9c95dae`. Per `050-api-reference.md:416-427`, these were "Phase 2" planned models that were scaffolded early but never wired to endpoints or UI. DB tables still exist (migrations not reverted).

| Model | DB Table | Status |
|-------|----------|--------|
| Allergen | `allergens` | `MenuItem.dietary_tags` (JSON) is the active dietary label feature |
| MenuItemAllergen | `menu_item_allergens` | Junction for Allergen — same as above |
| ModifierGroup | `modifier_groups` | `CustomizationOption` (marketing.py) is the active customization feature |
| ModifierOption | `modifier_options` | Same — part of ModifierGroup system |
| DeliveryZone | `delivery_zones` | Delivery radius uses `Store.delivery_radius_km` (commerce.py:100-115) |
| TaxRate | `tax_rates` | Not yet implemented |
| TaxCategory | `tax_categories` | Not yet implemented |
| RecipeItem | `recipe_items` | Not yet implemented |
| Reservation | `reservations` | Will rebuild when needed |

---

## Fixes Applied (This Session)

| Commit | Description |
|--------|-------------|
| `fbaa3f2` | Batch 1-3: security hardening, N+1 perf, code quality |
| `bdde919` | email-validator dependency, rate limit Request params |
| `72693dc` | OTP bypass DB-only (removed from env vars) |
| `6e98f89` | Fix query key: `otp_bypass_enabled` (not `_allowed`) |
| `1632edd` | Batch 4: code cleanup, MP4 magic bytes, gitignore, Safari compat |
| `aba2a5e` | Batch 5: cart sync on reconnect, auth:expired event, fnb-manage cleanup |
| `9c95dae` | Remove 9 orphaned compliance.py models |
| `25712b4` | WCAG copper contrast, sidebar CSS improvements, OTP limiter docs |
| `2bfb689` | Wire survey export + sales CSV export buttons |
| `a1c2e38` | Archive 24 endpoints (MOSTLY WRONG — restored later) |
| `d538441` | Docs update |
| `5ee0e71` | Replace in-process OTP rate limiter with Redis |
| `2654261` | Reward checkout fix + restore tables/release |
| `4c4c58c` | Restore 19 wrongly archived endpoints |
| `71e4394` | Restore upload/files, remove 2 dead endpoints |

---

## Endpoint Stats

| Category | Count |
|----------|:-----:|
| Total registered endpoints | 244 |
| Truly removed (dead, unarchived) | 2 |
| Orphaned models deleted | 9 |
| All documented endpoints active | 242 |
