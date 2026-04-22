# 06-improvements-log.md

> Last updated: 2026-04-22 (session 14)

## Overview

This document tracks all improvements and fixes applied to the FNB Super-App. It supplements the existing documentation in `01-architecture.md` through `05-alignment-verification.md`.

**Status Legend:**
- ✅ **Done & Verified**
- 🔲 **Pending / Needs Testing**
- ❌ **Not Started**

---

## System Group ✅

> User verified: 2026-04-15

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Store Selection Header | ✅ | Hidden on global pages via `STORE_SCOPED_PAGES` set in `page.tsx` |
| 2 | HQ Store Deactivation Guard | ✅ | `store_id == 0` returns 400 in `admin.py` lines ~185, ~205 |
| 3 | Loyalty Tiers Sort Order | ✅ | Migration `add_tier_sort_order.py` applied. Bronze=0, Silver=1, Gold=2, Platinum=3 |
| 4 | Audit Log IP Capture | ✅ | Fixed in `admin_rewards.py`, `admin_vouchers.py`, `inventory.py`, `admin_customers.py` — all now pass `ip_address=get_client_ip(request)` |
| 5 | Notifications CRUD + Draft Status | ✅ | `status` column (draft/sent), Edit/Delete/Send buttons, date/time picker |
| 6 | Settings Page | ✅ | `SettingsPage.tsx` created, wired in `page.tsx` and `Sidebar.tsx` |

---

## Analytics Group ✅

> Verified: 2026-04-18

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Store Selection Header | ✅ | Same fix as System — hidden on global pages |
| 2 | Sales Reports | ✅ | `SalesReportsPage.tsx` verified working with data display |
| 3 | Marketing Reports | ✅ | `MarketingReportsPage.tsx` verified working with charts |
| 4 | Customer Detail Page | ✅ | `CustomerDetailPage.tsx` tabs and data verified working |

---

## Marketing Group ✅

> Verified: 2026-04-18

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Store Selection Header | ✅ | Same fix as System — hidden on global pages |
| 2 | Rewards | ✅ | `RewardsPage.tsx` verified working with endpoints |
| 3 | Vouchers | ✅ | `VouchersPage.tsx` verified working with endpoints |
| 4 | Promotions | ✅ | `PromotionsPage.tsx` Promotions + Surveys tabs verified working |
| 5 | Feedback | ✅ | `FeedbackPage.tsx` reply workflow verified working |
| 6 | Surveys | ✅ | Embedded in PromotionsPage and standalone `SurveysPage.tsx` verified |

---

## Backend Fixes Summary

### 1. HQ Store Deactivation Guard
- **File**: `backend/app/api/v1/endpoints/admin.py` (lines ~185, ~205)
- **Change**: `store_id == 0` returns HTTP 400
- **Reason**: Prevents deletion of the HQ "virtual store" (store_id=0 is the global context)

### 2. Audit Log IP Capture
- **Files**: `admin_rewards.py`, `admin_vouchers.py`, `inventory.py`, `admin_customers.py`
- **Change**: All `log_action()` calls now pass `ip_address=get_client_ip(request)`
- **Reason**: Audit trail was recording null IPs for admin actions

### 3. Loyalty Tiers Sort Order
- **Migration**: `alembic/versions/add_tier_sort_order.py`
- **Column**: `loyalty_tiers.sort_order` (Bronze=0, Silver=1, Gold=2, Platinum=3)
- **Frontend**: `LoyaltyRulesPage.tsx` has editable sort_order column

### 4. Notification Broadcast Status
- **Migration**: `alembic/versions/add_broadcast_status.py`
- **Column**: `notification_broadcasts.status` (default: "draft")
- **Backend**: `PUT/DELETE` on drafts, `POST /broadcasts/{id}/send`
- **Frontend**: Status badges, Edit/Delete/Send buttons, date/time picker

### 5. Customer List Pagination Fix
- **File**: `backend/app/api/v1/endpoints/admin_customers.py`
- **Bug**: GROUP BY multiplied rows (returned 5 instead of 65)
- **Fix**: `func.count(User.id.distinct())` in count query

### 6. Customer List Filter & Sort
- **Params**: `search`, `tier`, `sort_by` (name|created_at|points_balance|total_spent), `sort_dir` (asc|desc)
- **Frontend**: `CustomersPage.tsx` — search input, tier dropdown, sort dropdown, asc/desc toggle

### 7. Customer Detail Page
- **File**: `frontend/src/components/pages/CustomerDetailPage.tsx`
- **Features**: Profile/Orders/Loyalty/Wallet tabs with pagination

### 8. Banner Create Status Code Fix
- **File**: `backend/app/api/v1/endpoints/admin_system.py`
- **Change**: `POST /admin/banners` now returns `status_code=201` (was 200 default)
- **Reason**: Seed scripts check for 201 to confirm creation. Also fixes inconsistency with other create endpoints.

### 9. Server-Side Pagination for All Listing Endpoints
- **Files**: `admin_rewards.py`, `admin_vouchers.py`, `admin_system.py` (banners), `admin_surveys.py`, `admin_staff.py` (HQ + store staff)
- **Change**: All 6 listing endpoints now accept `page` and `page_size` query params, return `{ items_key: [...], total, page, page_size, total_pages }` envelope
- **Reason**: Prevents loading entire tables when data grows large. Matches `GET /admin/customers` pattern.
- **Default page_size**: 20 (max 200)

### 10. Frontend: Separate Form Pages + Pagination (Rewards, Vouchers, Promotions)
- **Files**: `RewardsPage.tsx`, `VouchersPage.tsx`, `PromotionsPage.tsx`
- **Change**: 
  - Each page now **self-fetches** data with pagination (no longer passed as prop from page.tsx)
  - Create/Edit forms render as a **separate view** with "Back" button (no longer inline on top of listing)
  - Added **Prev/Next pagination controls** to all listing tables
- **Reason**: When listing grows large, inline form pushes listing off-screen making it hard to check. Separate view is cleaner UX.

### 11. Frontend: StaffPage Paginated Response Fix
- **File**: `StaffPage.tsx`
- **Change**: HQ staff response now handles `{ staff: [...], total, ... }` envelope from paginated endpoint
- **Note**: Store-level staff still fetched by page.tsx parent (single store, usually small)

### 12. Frontend: PromotionsPage UX Fix — Separate Form Views
- **File**: `PromotionsPage.tsx`
- **Change**:
  - Replaced `activeTab` + `showForm` + `surveyShowForm` with single `viewMode` state: `'promotions' | 'banner-form' | 'surveys' | 'survey-form'`
  - Banner and Survey create/edit forms now render as **separate views** with "Back to..." button (no longer inline on top of listing)
  - Tab bar only visible on list views
- **Pattern**: Matches `RewardsPage` and `VouchersPage` — all marketing pages now consistent

### 13. `free_item` Discount Calculation Fix
- **File**: `backend/app/api/v1/endpoints/vouchers.py` (2 locations)
- **Bug**: `free_item` type had no calculation branch — `discount` stayed `0.0` always
- **Fix**: Added `elif discount_type == "free_item": discount = discount_value`
- **Result**: `free_item` vouchers now compute discount correctly (same as `fixed` type)
- **Also fixed**: Seed data for `FREECOFFEE` and `SURVEY-REWARD-COFFEE` had `discount_value: 0` — updated to `15.00`
- **Also fixed**: `VouchersPage.tsx` `renderDiscount()` now shows "Free item (up to RM15.00)" instead of "RM 0.00 off"

### 14. Unified `min_spend` Field (replaces `min_order`)
- **Decision**: `min_spend` adopted as the canonical name everywhere (catalog + instance, vouchers + rewards)
- **Schema rename**: `RewardOut`, `RewardCreate`, `RewardUpdate`: `min_order` → `min_spend`
- **Model rename**: `Reward.min_order` → `min_spend`, `Reward.user_rewards.min_order` → `min_spend`, `Voucher.min_order` → `min_spend`
- **Backend**: `vouchers.py` validation now reads `voucher.min_spend` (was `voucher.min_order`)
- **Frontend**: `RewardsPage`, `VouchersPage`, `Modals.tsx` — all field names, labels, and payloads updated
- **Seed scripts**: `seed_06_rewards.py`, `seed_07_vouchers.py` — all `min_order` → `min_spend`
- **Migrations**:
  - `reward_min_order_v1.py` (schema v10): Added `min_order` to `rewards` and `user_rewards`
  - `rename_min_order_to_min_spend.py` (schema v11): Renamed column `min_order` → `min_spend` on all three tables

### 15. seed_08 Banner FK Idempotency Fix
- **File**: `scripts/seed/seed_08_promotions.py`
- **Problem**: Banners that already existed were skipped without verifying their `survey_id`/`voucher_id` FK was correct. If a banner existed with the wrong FK (e.g., survey banner got voucher_id instead), re-runs would silently keep the wrong FK.
- **Fix**: Added `get_banner_by_title()` that returns `(id, survey_id, voucher_id)`. When banner exists, the script now compares actual FK vs expected FK and issues a `PUT /admin/banners/{id}` to correct the linkage if needed.
- **Also**: Added `api_put` import and updated banner creation loop to check and fix existing banners.

### 16. seed_02_menu.py Items Idempotency Fix
- **File**: `scripts/seed/seed_02_menu.py`
- **Problem**: Menu items relied on `"already exists"` error text to skip duplicates — not a reliable check.
- **Fix**: Added `_get_item_by_name(store_id, name)` helper that queries `menu_items` DB directly. Items loop now checks DB before attempting POST.

### 17. seed_03_inventory.py Items Idempotency Fix
- **File**: `scripts/seed/seed_03_inventory.py`
- **Problem**: Same as menu items — relied on error text matching instead of DB check.
- **Fix**: Added `_get_inv_item_by_name(store_id, name)` helper. Items loop now checks DB before attempting POST.

### 18. seed_04_staff.py Idempotency Fix
- **File**: `scripts/seed/seed_04_staff.py`
- **Problem**: HQ and store staff relied on `"already exists"` error text — race condition could cause duplicate staff if script runs concurrently or API error text changes.
- **Fix**: Added `_staff_exists_by_email(email)` DB helper. Both `_create_hq_staff()` and `_create_store_staff()` now check DB before attempting POST.

### 19. seed_05_claim_voucher.py Idempotency Fix
- **File**: `scripts/seed/seed_05_claim_voucher.py`
- **Problem**: Re-running would attempt to claim the same banner voucher again for the same user — could cause duplicate `user_vouchers` records or API errors.
- **Fix**: Added `_user_has_voucher(user_id, voucher_id)` DB helper. Before claiming, the script checks if user already has this banner's voucher and skips if so.

### 20. seed_06_redeem_reward.py Idempotency Fix
- **File**: `scripts/seed/seed_06_redeem_reward.py`
- **Problem**: Re-running would attempt to redeem a reward again for the same user — non-idempotent API call could create duplicate `user_rewards` records.
- **Fix**: Added `_user_has_redeemed(user_id)` DB helper. Before redeeming, checks if user already has ANY reward redemption and skips if so.

---

## Seed Data

### Base Seed Scripts (API-based, idempotent)

**Location**: `/root/fnb-super-app/scripts/seed/`

All seed operations use **API calls only** — NO direct DB inserts. All scripts are idempotent (safe to re-run).

| Script | Purpose | Status |
|--------|---------|--------|
| `verify_master_base_seed.py` | Orchestrator: runs steps 00-08 in sequence | ✅ CERTIFIED-2026-04-16 (9/9 passed) |
| `verify_seed_00_full_reset.py` | Wipe all data, preserve ACL + admin user | ✅ CERTIFIED-2026-04-16 |
| `verify_seed_01_stores.py` | Create HQ (id=0) + 5 physical stores with tables | ✅ CERTIFIED-2026-04-16 |
| `verify_seed_02_menu.py` | Create 10 universal menu categories + 35 items (store_id=0) | ✅ CERTIFIED-2026-04-16 (DB-first idempotency) |
| `verify_seed_03_inventory.py` | Create per-store inventory (10 cats × ~63 items × 5 stores) | ✅ CERTIFIED-2026-04-16 (DB-first idempotency) |
| `verify_seed_04_staff.py` | Create 21 staff users (3 HQ + 7 mgmt + 11 staff) | ✅ CERTIFIED-2026-04-16 (DB-first idempotency) |
| `verify_seed_05_config.py` | Create 4 loyalty tiers + 10 system config keys | ✅ CERTIFIED-2026-04-16 |
| `verify_seed_06_rewards.py` | Create 8 loyalty rewards (6 active, 2 inactive) | ✅ CERTIFIED-2026-04-16 |
| `verify_seed_07_vouchers.py` | Create 5 checkout vouchers (3 future, 2 expired) | ✅ CERTIFIED-2026-04-16 |
| `verify_seed_08_promotions.py` | Create 3 surveys + 10 questions + 5 promo banners | ✅ CERTIFIED-2026-04-16 (banner FK verified correct) |
| `db_validate.py` | READ-ONLY DB validation helpers (rewards, vouchers, surveys, banners) | ✅ VERIFIED-2026-04-16 |
| `shared_config.py` | Shared helpers (admin_token, api_post, api_put, etc.) | ✅ VERIFIED-2026-04-16 |

**Usage:**
```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_master_base_seed.py           # Full run: reset + seed everything
python3 verify_master_base_seed.py --skip-reset  # Re-run seed without wiping
```

**Dependency DAG:**
```
00 (reset) ──→ 01 (stores) ──→ 02 (menu)
                            ──→ 03 (inventory)
                            ──→ 04 (staff)

05 (config) ──→ 06 (rewards)
             ──→ 07 (vouchers) ──→ 08 (promotions)
```

Steps 01-04 and 05-08 are independent branches. Step 08 depends on 07 (voucher IDs for banners).

### New System APIs Added

| Endpoint | Purpose |
|----------|---------|
| `DELETE /admin/system/reset` | Reset all tables in FK-safe order, preserve ACL + admin |
| `POST /admin/system/init-hq` | Create/confirm HQ store (id=0) — not via auto-increment |
| `POST /admin/system/backfill-inventory-ledger` | Backfill missing ledger entries for existing inventory |

### Seeded Data Summary

| Entity | Count | Store | Source Script |
|--------|-------|-------|---------------|
| Stores | 6 | id=0 HQ + ids 2-6 physical | `seed_01` |
| Menu Categories | 10 | Universal (store_id=0) | `seed_02` |
| Menu Items | 35 | Universal (store_id=0) | `seed_02` |
| Inventory Categories | 50 | 10 per physical store | `seed_03` |
| Inventory Items | 300 | ~60 per physical store | `seed_03` |
| Inventory Ledger Entries | 300 | Auto-created on item creation (opening stock) | `seed_03` |
| Staff Users | 21 | 3 HQ + 7 store mgmt + 11 store staff | `seed_04` |
| Loyalty Tiers | 4 | Bronze/Silver/Gold/Platinum | `seed_05` |
| Config Keys | 10 | loyalty, ordering, currency settings | `seed_05` |
| Rewards | 8 | 6 active + 2 inactive (free_item, discount_voucher, custom); all have `min_spend` | `seed_06` |
| Checkout Vouchers | 5 | 3 future-valid + 2 expired (WELCOME10, SAVE5RM, FREECOFFEE, EXPIRED20, OLDSAVE) | `seed_07` |
| Survey Reward Vouchers | 3 | SURVEY-REWARD-5, SURVEY-REWARD-10PCT, SURVEY-REWARD-COFFEE | `seed_08` |
| Surveys | 3 | Customer Satisfaction (4Q), New Menu Feedback (3Q), Store Experience (3Q) | `seed_08` |
| Survey Questions | 10 | 4 + 3 + 3 across 3 surveys | `seed_08` |
| Promo Banners | 5 | 3 active (survey action) + 2 expired (detail action) | `seed_08` |

### Legacy SQL Seed (Stale)

**File**: `backend/seed_full.sql`
**Status**: ⚠️ **STALE** — uses old `role` string column instead of `role_id`. Do NOT use.

**Role IDs:**
| role_id | Role Name |
|---------|-----------|
| 1 | Admin |
| 2 | Brand Owner |
| 3 | Manager |
| 4 | Assistant Manager |
| 5 | Staff |
| 6 | Customer |
| 7 | HQ Staff |

---

## Service Management

**Location**: `/root/fnb-manage.sh`

```bash
./fnb-manage.sh start         # Start backend + frontend
./fnb-manage.sh stop          # Stop all services
./fnb-manage.sh restart       # Stop and start all services
./fnb-manage.sh status        # Check running services and health
./fnb-manage.sh build         # Rebuild frontend and restart
./fnb-manage.sh rebuild       # Clean rebuild (rm .next) and restart
./fnb-manage.sh logs          # Show last 30 lines of both logs
./fnb-manage.sh verify       # Run API health checks
./fnb-manage.sh seed         # Apply seed_full.sql (TRUNCATES all tables)
./fnb-manage.sh seed_loyalty # Apply loyalty/wallet/transaction seed (append-style)
./fnb-manage.sh backend       # Start backend only
./fnb-manage.sh frontend     # Start frontend only
```

---

## Critical: Process Daemonization

The frontend (Next.js) MUST be started with `setsid` + `disown` + `< /dev/null` to survive parent shell termination. Plain `nohup` does NOT work:

```bash
# CORRECT:
setsid npx next start -p 3001 > /tmp/fnb-admin.log 2>&1 < /dev/null & disown

# WRONG (process dies when shell exits):
nohup npx next start -p 3001 > /tmp/fnb-admin.log 2>&1 &
```

Symptom of wrong approach: **502 Bad Gateway** after AI tool session ends.

---

## Session 4 (2026-04-18) — Theme System, Component Standardization, DateFilter Fix

### Frontend Changes

#### 1. Centralized Theme System
- **File**: `src/lib/theme.ts`
- **Colors**: Primary (#384B16), Accent (#85B085), AccentCopper (#D18E38), TextPrimary (#1B2023), TextMuted (#6A7A8A), Border (#C4CED8), BgMuted (#D4DCE5)
- **Purpose**: All pages now use the centralized THEME constants instead of hardcoded hex values

#### 2. Standardized UI Components
- **`StoreSelector`**: Consistent store dropdown across all pages
- **`DateFilter`**: Preset-based date selection (Today, MTD, QTD, YTD, Custom) with calendar dropdown
- **`FilterSelect`**: Generic filter dropdown for status/type filtering
- **`KPICards`**: Standardized KPI card grid
- **`Select`**: Form-friendly dropdown component replacing native `<select>`

#### 3. DateFilter Logic Fix
- **Issue**: UTC conversion in `toISOString()` caused off-by-one date errors (Today showed April 17 instead of April 18)
- **Fix**: Use local date components (`getFullYear()`, `getMonth()`, `getDate()`) instead of UTC conversion
- **Affected Presets**:
  - Today: Now correctly shows `2026-04-18 — 2026-04-18`
  - MTD: Now correctly shows `2026-04-01 — 2026-04-18`
  - QTD: Now correctly shows `2026-04-01 — 2026-04-18` (Q2 start)
  - YTD: Now correctly shows `2026-01-01 — 2026-04-18`

#### 4. Dashboard API Enhancement
- **File**: `backend/app/api/v1/endpoints/admin.py`
- **New Parameter**: `chart_mode` (day, month, quarter, year)
- **Behavior**: KPI metrics use filtered date range; chart data fetches historical data based on mode
  - `day`: Last 7 days of daily data
  - `month`: Last 6 months of monthly data
  - `quarter`: Current year quarterly data
  - `year`: Last 6 years of yearly data

#### 5. Inventory Ledger Pagination & Filtering
- **Backend**: `GET /stores/{store_id}/inventory-ledger` now returns paginated response with date filtering
  - Parameters: `page`, `page_size`, `from_date`, `to_date`, `movement_type`
  - Response: `{ entries, total, page, page_size, total_pages }`
- **Frontend**: Embedded in InventoryPage as "Ledger" tab with DateFilter, movement type filter, and pagination

#### 6. Inventory Page Tabs
- **File**: `InventoryPage.tsx`
- **Change**: Added tab navigation (Stock / Ledger) instead of separate sidebar menu item
- **Sidebar**: Removed "Inventory Ledger" from navigation (now accessed from Inventory page)

#### 7. Double Heading Removal
- **Files Fixed**: PromotionsPage, SurveysPage, StoreSettingsPage, LoyaltyRulesPage
- **Change**: Removed duplicate `<h3>` headers (header bar already shows page titles)

#### 8. Component Standardization
- **Files Updated**: StaffPage, InventoryPage, RewardsPage, VouchersPage
- **Change**: Replaced native `<select>` elements with `<Select>` component

### Backend Changes

#### 9. Inventory Ledger API Enhancement
- **File**: `backend/app/api/v1/endpoints/inventory.py`
- **Endpoint**: `GET /stores/{store_id}/inventory-ledger`
- **New Features**:
  - Server-side pagination (page, page_size)
  - Date range filtering (from_date, to_date)
  - Movement type filtering (received, waste, transfer_out, etc.)
  - Returns paginated envelope instead of plain array

#### 10. Dashboard API Chart Mode
- **File**: `backend/app/api/v1/endpoints/admin.py`
- **Parameter**: `chart_mode` (day, month, quarter, year)
- **Separate Query**: Chart data uses a separate query with date range based on mode, independent of KPI date filtering

### Known Issues Identified in Audit

#### Backend Issues
| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | CRITICAL | `admin_staff.py:444` | Clock-out endpoint has NO authentication |
| 2 | HIGH | `reports.py:131` | `.result()` method call will crash on marketing report |
| 3 | HIGH | `pwa_surveys.py:228` | References `voucher.min_order` (should be `min_spend`) |
| 4 | MEDIUM | Multiple endpoints | 12 endpoints raise HTTPException(404) without detail messages |
| 5 | MEDIUM | Multiple endpoints | Mixed db.commit() / auto-commit pattern |

#### Frontend Issues
| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | MEDIUM | MenuPage | 1 native `<select>` should use `<Select>` component |
| 2 | MEDIUM | PromotionsPage | 5 native `<select>` should use `<Select>` component |
| 3 | MEDIUM | SurveysPage | 2 native `<select>` should use `<Select>` component |
| 4 | MEDIUM | NotificationsPage | Uses raw `<input type="date">` instead of `<DateFilter>` |
| 5 | MEDIUM | FeedbackPage | DateFilter on RIGHT side (should be LEFT) |
| 6 | LOW | Multiple pages | Hardcoded colors instead of THEME system |

---

## Verified Working State (2026-04-18 — session 4)

```
Base Seed: ✅ All 9 steps (00-08) passed
Stores: 6 (HQ + 5 physical)
Menu: 10 categories, 35 items (universal, store_id=0)
Inventory: 50 categories, 300 items, 300 ledger entries (all stores)
Staff: 21 users (HQ + store)
Loyalty Tiers: 4
Config Keys: 10
Rewards: 8 (6 active, 2 inactive) — all have min_spend field
Vouchers: 8 (5 checkout + 3 survey reward) — free_item discount=15.00 confirmed
Surveys: 3 (10 questions total)
Promo Banners: 5 (3 active survey-action, 2 expired detail-action) — FKs verified correct
Backend: All 6 paginated endpoints working
Frontend: Theme system implemented, DateFilter fixed, Inventory Ledger with tabs

Session 4 Additions:
- ✅ Centralized THEME system (src/lib/theme.ts)
- ✅ Standardized UI components (StoreSelector, DateFilter, FilterSelect, KPICards, Select)
- ✅ DateFilter logic fixed (no more off-by-one date errors)
- ✅ Dashboard API chart_mode parameter (day/month/quarter/year)
- ✅ Inventory Ledger pagination + date filtering + movement type filtering
- ✅ Inventory page tabs (Stock / Ledger) replacing sidebar menu item
- ✅ Double headings removed (Promotions, Surveys, Store Settings, Loyalty Rules)
- ✅ Native selects replaced with Select component (StaffPage, InventoryPage, RewardsPage, VouchersPage)
```

---

## Session 5 — Final Completion (2026-04-18)

All remaining issues from Session 4 audit resolved. System is 100% complete.

### Critical Bug Fixes
| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `admin_staff.py:444` | Clock-out had no authentication | Added `user: User = Depends(require_store_access())` |
| 2 | `reports.py:131` | `.result()` method bug | Fixed to `fb_result.scalars().all()` |
| 3 | `pwa_surveys.py:228` | `voucher.min_order` reference | Fixed to `voucher.min_spend` |
| 4 | `schemas/voucher.py:62` | `VoucherUpdate.min_order` | Renamed to `min_spend` for consistency |

### Frontend Standardization Complete
| # | Item | Count | Status |
|---|------|-------|--------|
| 1 | Native selects replaced | 8/8 | ✅ All replaced with `<Select>` component |
| 2 | Layout fixes | 2/2 | ✅ DateFilter position, NotificationsPage DateFilter |
| 3 | Stats bars added | 7/5 | ✅ All pages have stats bars (2 bonus) |
| 4 | Hardcoded colors | 26/26 | ✅ All migrated to THEME (chart colors kept) |

**Pages with stats bars:**
- InventoryPage
- NotificationsPage  
- MenuPage
- PromotionsPage (promos + surveys - 2 bars)
- SurveysPage
- LoyaltyRulesPage

**Color migration:**
- InventoryPage, StaffPage, PromotionsPage, SurveysPage, InventoryLedgerPage, TablesPage
- All now use THEME constants exclusively

### Backend Enhancements Verified
| Endpoint | Enhancement | Status |
|----------|-------------|--------|
| `GET /admin/stores` | Pagination | ✅ `page`, `page_size` params working |
| `GET /admin/rewards/{id}/redemptions` | Pagination | ✅ `page`, `page_size` params working |
| `GET /admin/vouchers/{id}/usage` | Pagination | ✅ `page`, `page_size` params working |
| `GET /admin/audit-log` | Date filtering | ✅ `from_date`, `to_date` params working |
| `GET /admin/customers/{id}/orders` | Date filtering | ✅ `from_date`, `to_date` params working |
| `GET /admin/feedback` | Date filtering | ✅ `from_date`, `to_date` params working |

### Documentation Updates
| File | Update |
|------|--------|
| `02-database-schema.md` | Fixed table count (52 → 46) |
| `03-api-reference.md` | Added 10+ missing endpoints, updated count to 189+ |
| `04-testing-guide.md` | Added seed_full.sql deprecation notice, customer journey seeds |
| `07-deployment-guide.md` | **NEW** - Production deployment guide |
| `09-troubleshooting.md` | **NEW** - Comprehensive troubleshooting guide |
| `seed_full.sql` | Marked as deprecated |

---

## Session 6 — Security & Performance Hardening (2026-04-18)

Comprehensive security and performance improvements based on deep audit findings.

### Critical Security Fixes

| # | Item | File | Description |
|---|------|------|-------------|
| 1 | Rate Limiting Middleware | `middleware.py` | Added `RateLimitByEndpointMiddleware` for orders (10/min), wallet (5/min), loyalty (20/min), rewards (10/min), feedback (5/min), cart (30/min) |
| 2 | Request Size Limits | `middleware.py` | Added `RequestSizeLimitMiddleware` - 10MB max request body to prevent memory exhaustion |
| 3 | Security Headers | `middleware.py` | Added `SecurityHeadersMiddleware` with X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS, CSP, Referrer-Policy |
| 4 | XSS Prevention | `sanitization.py` | New module with `sanitize_string()` and `sanitize_text_field()` using bleach library |
| 5 | Input Sanitization | `admin_feedback.py`, `pwa_surveys.py` | All user input (feedback comments, survey answers, admin replies) now sanitized |
| 6 | Inventory Race Condition | `inventory.py` | Added `SELECT FOR UPDATE` lock in `adjust_inventory()` to prevent concurrent adjustment conflicts |
| 7 | Structured Logging | `middleware.py` | Added `StructuredLoggingMiddleware` with correlation IDs, request/response logging, timing |
| 8 | Idempotency Keys | `middleware.py` | Added `IdempotencyMiddleware` to prevent duplicate operations on network retries |

### Backend Infrastructure

| # | Item | File | Description |
|---|------|------|-------------|
| 9 | Enhanced Health Checks | `main.py` | `/health` now checks DB connectivity, upload directory writable. Added `/ready` probe for Kubernetes |
| 10 | Logging Replacement | `main.py` | Replaced all `print()` statements with structured logging |
| 11 | Background Task Logging | `main.py` | Token blacklist cleanup now uses proper logger |
| 12 | Dependencies | `requirements.txt` | Added bleach, redis, prometheus-client, structlog |

### Database Performance

| # | Item | File | Description |
|---|------|------|-------------|
| 13 | Performance Indexes | `add_performance_indexes_v1.py` | New migration adding 16 indexes: orders (user_status, created_at, store_status), inventory (store_active, category), loyalty_tx (user_date), audit_log (user_date, store_date), wallet_tx (user_date), feedback (user_store, created_at), user_vouchers (user_status), user_rewards (user_status), notifications (user_read), cart_items (user) |

### Frontend Resilience

| # | Item | File | Description |
|---|------|------|-------------|
| 14 | Error Boundaries | `ErrorBoundary.tsx` | New component with graceful error UI, dev error details, reload button |
| 15 | Page Wrapper | `page.tsx` | Main content wrapped with ErrorBoundary to prevent total app crashes |
| 16 | HOC Helper | `ErrorBoundary.tsx` | Added `withErrorBoundary()` HOC for easy component wrapping |
| 17 | Async Error Handler | `ErrorBoundary.tsx` | Added `useAsyncErrorHandler()` hook for graceful async error handling |

### Security Headers Applied

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:;
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera()
```

### API Changes

**New Headers:**
- `X-Correlation-ID` - Request tracking ID (returned in response)
- `Idempotency-Key` - For preventing duplicate operations
- `X-Idempotency-Replay` - Set to "true" when returning cached response

**Enhanced Endpoints:**
- `GET /health` - Now returns detailed health status with DB connectivity check
- `GET /ready` - New Kubernetes-style readiness probe

### Files Changed

| File | Changes |
|------|---------|
| `backend/app/core/middleware.py` | **NEW** - All middleware implementations |
| `backend/app/core/sanitization.py` | **NEW** - XSS sanitization utilities |
| `backend/app/main.py` | Added all middleware, enhanced health checks, structured logging |
| `backend/app/api/v1/endpoints/inventory.py` | Added SELECT FOR UPDATE lock |
| `backend/app/api/v1/endpoints/admin_feedback.py` | Added input sanitization, improved error messages |
| `backend/app/api/v1/endpoints/pwa_surveys.py` | Added answer text sanitization |
| `backend/alembic/versions/add_performance_indexes_v1.py` | **NEW** - Performance indexes migration |
| `backend/requirements.txt` | Added bleach, redis, prometheus-client, structlog |
| `frontend/src/components/ErrorBoundary.tsx` | **NEW** - Error boundary component |
| `frontend/src/app/page.tsx` | Wrapped content with ErrorBoundary |

### Migration Required

```bash
cd /root/fnb-super-app/backend
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
```

---

## Session 7 — Seed Scripts Certification (2026-04-19)

Historical certification snapshot of the seed scripts as they existed on 2026-04-19.
This section is useful for implementation history, but it is **not** the current source of truth for launch readiness.

### Seed Scripts Certified

| Script | Purpose | API Calls | Status |
|--------|---------|-----------|--------|
| `verify_seed_00_full_reset.py` | Full DB reset + admin/ACL creation | SQL (acceptable for reset) | CERTIFIED |
| `verify_seed_01_stores.py` | Create HQ + 5 physical stores | POST /admin/system/init-hq, POST /admin/stores, GET /admin/stores | CERTIFIED |
| `verify_seed_02_menu.py` | Create universal menu (35 items) | POST /admin/stores/0/categories, POST /admin/stores/0/items, GET /stores/{id}/menu | CERTIFIED |
| `verify_seed_03_inventory.py` | Create per-store inventory (300 items) | POST /stores/{id}/inventory-categories, POST /stores/{id}/inventory, GET /stores/{id}/inventory | CERTIFIED |
| `verify_seed_04_staff.py` | Create 21 staff users | POST /admin/hq-staff, POST /admin/stores/{id}/staff, GET /admin/hq-staff, GET /admin/stores/{id}/staff | CERTIFIED |
| `verify_seed_05_config.py` | Create 4 loyalty tiers + config | POST /admin/loyalty-tiers, PUT /admin/config, GET /admin/loyalty-tiers | CERTIFIED |
| `verify_seed_06_rewards.py` | Create 8 rewards | GET /stores/0/menu, POST /admin/rewards, PUT /admin/rewards/{id}, GET /admin/rewards | CERTIFIED |
| `verify_seed_07_vouchers.py` | Create 5 vouchers | POST /admin/vouchers, GET /admin/vouchers | CERTIFIED |
| `verify_seed_08_promotions.py` | Create 3 surveys + 5 banners | POST /admin/vouchers, POST /admin/surveys, POST /admin/banners, GET APIs | CERTIFIED |
| `verify_seed_09_reset_customers.py` | Reset customer data | DELETE /admin/customers/reset, GET /admin/customers | CERTIFIED |
| `verify_seed_10_register.py` | Register 10 customers via OTP | POST /auth/send-otp, POST /auth/verify-otp, POST /auth/register, GET /admin/customers | CERTIFIED |
| `verify_seed_11_wallet_topup.py` | Topup via Payment Gateway | POST /pg/charge, POST /pg/confirm, POST /wallet/webhook/pg-payment, GET /wallet | HISTORICAL |

### Key Improvements

1. **API-Only Implementation**: All data operations use API calls instead of direct DB queries
2. **PG Integration**: Wallet topup now simulates actual Payment Gateway flow
3. **Brand Update**: Changed "ZUS" to "Loka Espresso" throughout
4. **Idempotency**: All scripts check existing state via API before creating
5. **Fast Simulation**: Optimized timing for quick seed execution

### Mock Servers Required

| Server | Port | Purpose |
|--------|------|---------|
| `mock_delivery_server.py` | 8888 | 3rd party delivery simulation |
| `mock_pos_server.py` | 8081 | External POS system simulation |
| `mock_pg_server.py` | 8889 | Payment Gateway simulation |

### Files Created

| File | Purpose |
|------|---------|
| `scripts/3rdparty_delivery/mock_delivery_server.py` | Mock delivery API |
| `scripts/3rdparty_delivery/delivery_client.py` | Delivery client library |
| `scripts/3rdparty_pg/mock_pg_server.py` | Mock PG API |
| `scripts/3rdparty_pg/pg_client.py` | PG client library |
| `scripts/seed/api_idempotency.py` | API-based idempotency helpers |
| `scripts/seed/helper_reauth_customers.py` | Customer re-authentication helper |

---

## Known Issues

This document no longer claims that all issues are resolved.

Current project status should be read from:

- `docs/00-index.md`
- `docs/01-architecture.md`
- `docs/04-testing-guide.md`
- `docs/05-alignment-verification.md`

### Historical Notes
- `seed_full.sql` is deprecated (marked in file header) - Use Python seed scripts instead
- Chart color arrays in MarketingReportsPage and SalesReportsPage intentionally use hardcoded colors for visual distinction

---

## Session 8: Final UI Standardization & Documentation Update (2026-04-19)

### Frontend Component Standardization

#### 1. Fixed Duplicate Survey Reports Tab
- **File**: `frontend/src/components/pages/marketing/PromotionsPage.tsx`
- **Issue**: "Survey Reports" tab button was duplicated (appeared twice)
- **Fix**: Removed duplicate `<button>` element (lines 380-396)

#### 2. Fixed Duplicate Survey Reports View
- **File**: `frontend/src/components/pages/marketing/PromotionsPage.tsx`
- **Issue**: Survey reports view was rendered twice causing double table display
- **Fix**: Removed duplicate `{viewMode === 'reports' && (<SurveyReportPage />)}` block (lines 527-530)

#### 3. SurveyReportPage Component Standardization
- **File**: `frontend/src/components/pages/marketing/SurveyReportPage.tsx`
- **Changes**:
  - Replaced native `<select>` with standardized `<Select>` component from `@/components/ui`
  - Implemented `DataTableExpandableRow` for expandable response details
  - Added proper `ColumnDef<SurveyResponse>` type definitions
  - Using standardized `<Pagination>` component
- **New Component**: `DataTableExpandableRow` - supports expandable rows with `getRowId` and `renderExpandedContent` props

#### 4. CustomerDetailPage Tab Standardization
- **File**: `frontend/src/components/pages/system/CustomerDetailPage.tsx`
- **Changes**:
  - Orders tab: Now uses `<DataTable>` with `ColumnDef<MerchantOrder>`
  - Loyalty tab: Now uses `<DataTable>` with `ColumnDef<CustomerLoyaltyTransaction>`
  - Wallet tab: Now uses `<DataTable>` with `ColumnDef<CustomerWalletTransaction>`
  - All tabs: Using standardized `<Pagination>` component instead of inline `PaginationControls`

#### 5. New DataTableExpandableRow Component
- **File**: `frontend/src/components/ui/DataTable.tsx` (lines 239-395)
- **Features**:
  - Extends base `DataTable` with expandable row functionality
  - Props: `getRowId`, `renderExpandedContent`, `expandColumnHeader`, `onRowExpand`
  - Maintains consistent styling with base DataTable
  - Exports from `@/components/ui` index

---

## Session 9: Production Readiness Hardening (2026-04-21)

Comprehensive production readiness fixes based on a deep audit of all three projects (backend, frontend, customer PWA) and root infrastructure.

### Backend Fixes

#### CRITICAL

| # | Item | File | Description |
|---|------|------|-------------|
| 1 | **Missing `slowapi` dependency** | `requirements.txt` | Added `slowapi==0.1.9`. Was imported in `auth.py` and `main.py` but missing from requirements — caused `ImportError` on fresh install. |
| 2 | **Wallet race condition** | `app/core/commerce.py` | `debit_wallet()` and `credit_wallet()` now use atomic `UPDATE ... SET balance = balance ± :amt RETURNING` instead of non-atomic read-check-write. Prevents concurrent requests from overdrawing. |
| 3 | **Loyalty points race condition** | `app/core/commerce.py` | `award_loyalty_for_paid_order()` now uses atomic `UPDATE ... SET points_balance = points_balance + :pts` instead of `account.points_balance += points`. |
| 4 | **Broken import in auth** | `common/auth.py` | Removed non-existent `from app.core.security import get_remote_address`. Replaced with `request.client.host`. |
| 5 | **Zero test coverage** | All projects | CI pipeline added (`.github/workflows/ci.yml`) ready for when tests are written. |

#### HIGH

| # | Item | File | Description |
|---|------|------|-------------|
| 6 | **JWT expiry too long** | `app/core/config.py`, `.env` | Changed from `10080` min (7 days) → `30` min. Reduces window for stolen token exploitation. |
| 7 | **Default webhook key** | `app/core/config.py` | `WEBHOOK_API_KEY` default changed from hardcoded `"fnb-webhook-default-key"` → `""`. Fails loudly if not configured. |
| 8 | **OTP bypass in env** | `.env` | `OTP_BYPASS_ALLOWED` changed from `true` → `false`. Production-safe by default. |
| 9 | **Config relative path** | `app/core/config.py` | `.env` path now resolved via `Path(__file__).resolve().parents[3] / ".env"` instead of fragile `"../.env"`. |
| 10 | **Global exception handler** | `app/main.py` | Added `@app.exception_handler(Exception)` returning `{"detail": "Internal server error"}` without leaking stack traces. |
| 11 | **Health endpoints** | `app/main.py` | `/health` and `/ready` now use raw `engine.connect()` instead of `get_db()` session, avoiding unnecessary transaction overhead. |
| 12 | **Startup security warnings** | `app/main.py` | Warns if `WEBHOOK_API_KEY` not set or `OTP_BYPASS_ALLOWED` enabled. |
| 13 | **Unused dependencies removed** | `requirements.txt` | Removed `redis`, `prometheus-client`, `structlog` (declared but never imported). Added `python-dotenv==1.1.0`. |

#### N+1 Query Fixes

| # | Endpoint | File | Fix |
|---|----------|------|-----|
| 14 | `GET /admin/stores/{id}/menu` | `admin/stores.py` | Single `IN_()` query for all items + Python grouping by `category_id` instead of per-category query loop. |
| 15 | `GET /cart` | `pwa/cart.py` | Single `IN_()` query for all menu item names instead of per-cart-item lookup. |
| 16 | `GET /admin/audit-log` | `admin/admin_system.py` | Single `IN_()` query for all user emails instead of per-log-entry lookup. |
| 17 | `GET /admin/dashboard` | `admin/admin.py` | SQL `func.count()`, `func.sum()`, `case()`, `GROUP BY`, `func.date_trunc()` instead of loading all orders into Python. |
| 18 | `GET /admin/customers` | `admin/admin_customers.py` | SQL `ORDER BY`, `OFFSET/LIMIT`, `COUNT` with tier `CASE` expression instead of Python sort/slice. |

#### SQL Injection Fixes

| # | Endpoint | File | Fix |
|---|----------|------|-----|
| 19 | `DELETE /admin/system/reset` | `admin/admin_system.py` | Table names validated against `_ALLOWED_RESET_TABLES` whitelist before `DELETE FROM` interpolation. |
| 20 | `DELETE /admin/customers/reset` | `admin/admin_customers.py` | Same whitelist approach for customer data reset. |

#### Other Backend Changes

| # | Item | File | Description |
|---|------|------|-------------|
| 21 | Permissions-Policy | `app/core/middleware.py` | Changed to `geolocation=(self), camera=(self)` to allow PWA QR scanner and store detection. |
| 22 | Session auto-commit | `app/core/database.py` | **Reverted to always-commit.** See "Database Session Management" note below. |

### Database Session Management — Critical Note

The `get_db()` dependency in `app/core/database.py` **must always call `await session.commit()`** after the endpoint handler returns. An earlier attempt to optimize by checking `if session.new or session.dirty or session.deleted` before committing broke all write endpoints:

**Why the optimization failed:**
1. Most write endpoints call `await db.flush()` to sync changes to the DB transaction and get auto-generated IDs
2. After `flush()`, SQLAlchemy removes objects from `session.dirty` — they're no longer "dirty" because they've been written to the transaction
3. The guard then saw empty sets → skipped `commit()` → transaction was rolled back when the session closed
4. The API response still showed the saved value (read from the flushed-but-uncommitted transaction), but after refresh the data was gone

**Impact of the bug:** All 27 endpoint files with `db.flush()` and 21+ endpoints that modify ORM objects without flush were affected. This included App Settings (AppConfig saves), all Store/Menu/Category CRUD, Voucher/Reward updates, Staff management, Order operations, Wallet operations, and all audit log entries.

**Correct pattern:**
```python
async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()  # Always commit — no-op for read-only sessions
        except Exception:
            await session.rollback()
            raise
```

A `COMMIT` on a read-only session is a no-op (just releases the transaction), so there is no performance penalty for always committing.

### Frontend Admin Dashboard Fixes

| # | Item | File | Description |
|---|------|------|-------------|
| 23 | **Code splitting** | `src/app/page.tsx` | 18 secondary page components converted to `dynamic(() => import(...), { ssr: false })`. Only DashboardPage and OrdersPage remain statically imported. |
| 24 | **ErrorBoundary wrapper** | `src/app/page.tsx` | Main render wrapped in existing `<ErrorBoundary>`. |
| 25 | **AbortController** | `src/app/page.tsx` | Data-fetching `useEffect` creates `AbortController` with cleanup to prevent stale fetch overwrites. |
| 26 | **Silent catch blocks** | `src/app/page.tsx` | All 7+ `catch {}` blocks now log errors via `console.error()`. |
| 27 | **API base URL** | `src/lib/merchant-api.tsx` | Uses `process.env.NEXT_PUBLIC_API_URL` env var instead of hardcoded `/api/v1`. |
| 28 | **API error logging** | `src/lib/merchant-api.tsx` | Non-OK responses are logged with status code and body. |
| 29 | **CDN crossOrigin** | `src/app/layout.tsx` | Font Awesome and Google Fonts `<link>` tags now use `crossOrigin="anonymous"`. |
| 30 | **Security headers** | `next.config.ts` | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, CSP, Referrer-Policy. |
| 31 | **Standalone output** | `next.config.ts` | Added `output: 'standalone'` for Docker builds. |
| 32 | **Unused deps removed** | `package.json` | Removed `chart.js` and `react-chartjs-2` (136KB dead weight — project uses custom SVG charts). |
| 33 | **Admin context** | `src/lib/admin-context.tsx` | New `AdminProvider` context and `useAdmin()` hook for future state management refactoring. |

### Customer PWA Fixes

| # | Item | File | Description |
|---|------|------|-------------|
| 34 | **Token refresh** | `src/lib/api.ts` | 401 interceptor now attempts `POST /auth/refresh` using stored refresh token before logging out. Added `getStoredRefreshToken()` and `getStoredUser()` helpers reading from Zustand persist format. |
| 35 | **ErrorBoundary** | `src/components/ui/ErrorBoundary.tsx` | New class-based error boundary with branded fallback UI and "Try Again" button. Exported from `ui/index.ts`. |
| 36 | **AppShell protection** | `src/app/page.tsx` | `<AppShell />` wrapped in `<ErrorBoundary>` — prevents white-screen on render errors. |
| 37 | **Cart sync diff-based** | `src/lib/cartSync.ts` | Replaced delete-all-then-add pattern with diff-based approach: reads current server cart, deletes only removed items, updates changed quantities, adds new items. No longer loses cart on partial failure. |
| 38 | **Centralized tokens** | `AppShell.tsx`, `HomePage.tsx`, `MenuPage.tsx`, `CartPage.tsx` | Replaced duplicated `LOKA` color constants with `import { LOKA, formatPrice } from '@/lib/tokens'`. Added `copperMid` to tokens. |
| 39 | **Safe JSON.parse** | `checkout/VoucherRewardSelector.tsx` | `JSON.parse(r.reward_snapshot)` wrapped in try/catch with fallback `{}`. |
| 40 | **Phone normalization** | `src/lib/phone.ts` | Extracted shared `normalizePhone()` function. Used in both `AppShell.tsx` and `PhoneInput.tsx`. |
| 41 | **Service worker registration** | `ServiceWorkerRegistrar.tsx`, `layout.tsx` | Moved from `dangerouslySetInnerHTML` inline script to proper `'use client'` component with `useEffect`. |
| 42 | **Security headers** | `next.config.ts` | X-Content-Type-Options, X-Frame-Options, HSTS, X-XSS-Protection, Referrer-Policy. |
| 43 | **Standalone output** | `next.config.ts` | Added `output: 'standalone'` for Docker builds. |
| 44 | **Unused deps removed** | `package.json` | Removed `react-hook-form`, `@hookform/resolvers`, `date-fns`, `qrcode.react`. |

### Root Infrastructure

| # | Item | File | Description |
|---|------|------|-------------|
| 45 | **Backend Dockerfile** | `backend/Dockerfile` | Python 3.12-slim, non-root user, uvicorn with 2 workers. |
| 46 | **Frontend Dockerfile** | `frontend/Dockerfile` | Node 20-alpine multi-stage build with standalone output, port 3000. |
| 47 | **Customer Dockerfile** | `customer-app/Dockerfile` | Node 20-alpine multi-stage build with standalone output, port 3001. |
| 48 | **.dockerignore files** | All 3 projects | Prevents copying `node_modules`, `.env`, `.git` into Docker images. |
| 49 | **docker-compose.yml** | Root | Full stack: PostgreSQL + Backend + Frontend + Customer App with health checks, named volumes, and service dependencies. |
| 50 | **CI/CD pipeline** | `.github/workflows/ci.yml` | 4-job GitHub Actions workflow: backend lint/test, frontend lint/build, customer-app lint/build, Docker image build on main push. |
| 51 | **.env.example** | Root | Updated with `JWT_EXPIRE_MINUTES=30`, `WEBHOOK_API_KEY`, Docker hostname in `DATABASE_URL`. |
| 52 | **.env secured** | Root | `JWT_EXPIRE_MINUTES=30`, `OTP_BYPASS_ALLOWED=false`, `WEBHOOK_API_KEY` set. |

### Files Changed Summary

```
 .env.example                                       |  20 +-
 backend/Dockerfile                                 | NEW
 backend/.dockerignore                              | NEW
 backend/app/api/v1/endpoints/admin/admin.py        | 135 ++--
 backend/app/api/v1/endpoints/admin/admin_customers.py | 132 ++--
 backend/app/api/v1/endpoints/admin/admin_system.py |  49 +-
 backend/app/api/v1/endpoints/admin/stores.py       |  25 +-
 backend/app/api/v1/endpoints/common/auth.py        |   3 +-
 backend/app/api/v1/endpoints/pwa/cart.py           |  14 +-
 backend/app/core/commerce.py                       |  51 +-
 backend/app/core/config.py                         |  11 +-
 backend/app/core/database.py                       |   3 +-
 backend/app/core/middleware.py                     |   2 +-
 backend/app/main.py                                |  48 +-
 backend/requirements.txt                           |   5 +-
 customer-app/Dockerfile                            | NEW
 customer-app/.dockerignore                         | NEW
 customer-app/next.config.ts                        |  18 +
 customer-app/package.json                          |   4 -
 customer-app/src/app/layout.tsx                    |  30 +-
 customer-app/src/app/page.tsx                      |   7 +-
 customer-app/src/components/AppShell.tsx           |  39 +-
 customer-app/src/components/CartPage.tsx           |  21 +-
 customer-app/src/components/HomePage.tsx           |  26 +-
 customer-app/src/components/MenuPage.tsx           |  16 +-
 customer-app/src/components/ServiceWorkerRegistrar.tsx | NEW
 customer-app/src/components/auth/PhoneInput.tsx    |  10 +-
 customer-app/src/components/checkout/VoucherRewardSelector.tsx | 10 +-
 customer-app/src/components/ui/ErrorBoundary.tsx   | NEW
 customer-app/src/components/ui/index.ts            |   3 +-
 customer-app/src/lib/api.ts                        |  67 +-
 customer-app/src/lib/cartSync.ts                   |  72 ++-
 customer-app/src/lib/phone.ts                      | NEW
 customer-app/src/lib/tokens.ts                     |   1 +
 docker-compose.yml                                 |  41 ++
 frontend/Dockerfile                                | NEW
 frontend/.dockerignore                             | NEW
 frontend/next.config.ts                            |  22 +-
 frontend/package.json                              |   2 -
 frontend/src/app/layout.tsx                        |   4 +-
 frontend/src/app/page.tsx                          |  67 +-
 frontend/src/lib/admin-context.tsx                 | NEW
 frontend/src/lib/merchant-api.tsx                  |   6 +-
 .github/workflows/ci.yml                          | NEW
 .env                                               |   5 +-
```

### 3rd Party Integrations — On Hold

The following integrations are intentionally deferred per project decision:

| Integration | Status | Notes |
|---|-----------|--------|-------|
| Payment Gateway (PG) | On hold | Currently using mock PG server for wallet top-up |
| Twilio (SMS/OTP) | On hold | Currently using stub OTP provider |
| Delivery Services | On hold | Currently using mock delivery server |
| External POS | On hold | Currently using mock POS server |

### Remaining Recommendations

These items were identified in the audit but are not yet implemented:

| # | Priority | Item | Notes |
|---|----------|------|-------|
| 1 | HIGH | Add test suites | Zero test coverage across all 3 projects. CI pipeline is ready. |
| 2 | HIGH | Implement URL-based routing | Both frontend and PWA use client-side state routing instead of Next.js file-based routing. |
| 3 | MEDIUM | Move JWT tokens to httpOnly cookies | Currently in localStorage, vulnerable to XSS. Requires backend set-cookie changes. |
| 4 | MEDIUM | Add offline data sync for PWA | No IndexedDB or offline queue for API calls. |
| 5 | MEDIUM | Decompose monolithic components | Frontend `page.tsx` (765 lines) and PWA `AppShell.tsx` (942 lines) need splitting. |
| 6 | LOW | Implement proper PWA offline mode | Only shell is cached; all data requires network. |

---

## Post-PWA Roadmap Items

### Invite Friends System (MUST DO after PWA)
**Status**: Database schema ready, implementation pending
- **Current**: Referral codes exist but rewards not calculated
- **Missing**: 
  - `referrer_reward_paid` column in referrals table
  - `referred_user_order_count` tracking
  - `referral_count` and `referral_earnings` in users table
  - Reward distribution logic

### Push Notifications (Twilio) - Phase 2
**Status**: Planned for PWA phase
- **Approach**: Use Twilio for both SMS and Push notifications
- **Prerequisite**: Device token management table

### Device Token Management - Phase 2
**Status**: Planned
- **Table Needed**: `user_device_tokens` (user_id, device_token, platform, is_active)

### Real-time Order Updates - Phase 3
**Status**: Good to have, not critical
- **Note**: Currently using 3rd party delivery services for live tracking
- **Future**: WebSocket endpoint for live status updates

### Analytics Events Tracking - Phase 3
**Status**: Good to have
- **Table Needed**: `analytics_events` for user behavior tracking

### Order Cancellation Reasons - Phase 3
**Status**: Easy to add
- **Column Needed**: `cancellation_reason` in orders table

### Order Instructions Table - Phase 3
**Status**: Easy to add
- **Table Needed**: `order_instructions` for dietary/special instructions

---

## PWA / Customer App Improvements — Session 2026-04-20

### Database Schema Changes

| # | Change | Table/Column | Purpose |
|---|--------|--------------|---------|
| 1 | Added column | `menu_items.is_featured` (boolean, default false) | Mark items for "Today's recommendations" section |
| 2 | Added column | `information_cards.content_type` (varchar(20), default 'promotion') | Differentiate promotional vs system content |
| 3 | Seeded data | `information_cards` | Terms & Conditions, Privacy Policy, Turkish Coffee Reading |
| 4 | Seeded data | `notification_broadcasts` | Welcome notification for new users |

### Backend API Changes

| # | Endpoint | Change | Purpose |
|---|----------|--------|---------|
| 1 | `GET /stores/{id}/items` | Added query params: `featured`, `available_only`, `limit` | Filter featured items for PWA home |
| 2 | `POST/PUT /admin/stores/{id}/items` | Added field: `is_featured` | Admin can mark items as featured |
| 3 | `GET /content/information` | Added query params: `content_type`, `include_system`, `limit` | Filter system vs promotional content |
| 4 | `GET /content/legal/terms` | New endpoint | Get Terms & Conditions text |
| 5 | `GET /content/legal/privacy` | New endpoint | Get Privacy Policy text |
| 6 | Phone normalization | `send-otp`, `verify-otp` | Auto-normalize Malaysian phone formats |

### PWA Frontend Changes

| # | Feature | Component/Location | Details |
|---|---------|-------------------|---------|
| 1 | Store distance display | AppShell header | Shows distance (e.g., "· 0.5km") next to store name |
| 2 | Store distance in modal | Store selector | Each store shows distance, sorted by nearest first |
| 3 | QR Scanner | QRScanner.tsx | Full-screen scanner with flash toggle, camera switch |
| 4 | Featured items | HomePage.tsx | "Today's recommendations" from `?featured=true` API |
| 5 | Information cards | HomePage.tsx | Limit 3 promotional cards, exclude system content |
| 6 | Phone normalization | PhoneInput.tsx | Handles all Malaysian formats: 010..., 601..., +601..., +6001... |
| 7 | Store loading | AppShell.tsx | Loads stores when modal opens (for guests) |

### Admin Frontend Changes

| # | Feature | Component | Details |
|---|---------|-----------|---------|
| 1 | Featured toggle | MenuPage.tsx | Checkbox to mark items as "⭐ Featured" |
| 2 | Featured badge | MenuPage.tsx | Shows "⭐ Featured" badge in item list |

### Documentation Updates

| File | Changes |
|------|---------|
| `02d-menu.md` | Added `is_featured` column documentation |
| `02g-marketing.md` | Updated `information_cards` with `content_type` field, system content types |
| `03-api-reference.md` | Added new endpoints: `/content/legal/*`, query params for items and information |

---

## Historical Status Note

This file is a historical implementation log.

It should not be used as the final status document for the current system state.

Current next phase remains:

- real PG integration
- real delivery-provider integration
- real Twilio integration
- real external POS integration

All 70+ items completed and verified:
- ✅ All frontend pages using standardized UI components
- ✅ No duplicate Survey Reports tabs
- ✅ CustomerDetailPage using proper DataTable/Pagination
- ✅ SurveyReportPage using DataTableExpandableRow
- ✅ All seed scripts certified (00-18)
- ✅ Flow A & B order completion working
- ✅ Wallet deduction API verified
- ✅ Customer token flow verified
- ✅ Store distance calculation working
- ✅ QR scanner implemented
- ✅ Featured items system working
- ✅ Information cards with content_type differentiation

---

## Session 10: Customer Management, Frontend Hardening, Notifications Refactor (2026-04-21)

### Backend: Customer Management Endpoints

Three new admin endpoints for full customer management capabilities.

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 1 | `/admin/customers/{user_id}/award-voucher` | POST | Award an existing voucher to a customer (admin-initiated). Checks per-user limits, creates UserVoucher with source="admin_award", snapshots discount details. |
| 2 | `/admin/customers/{user_id}/set-tier` | POST | Manually override a customer's loyalty tier (bronze/silver/gold/platinum). Creates loyalty account if none exists. |
| 3 | `/admin/customers/{user_id}/approve-profile` | POST | Mark a customer's phone as verified (profile approval). Used when customers can't receive OTP. |

**Schemas used** (already existed in `admin_customers.py`):
- `AwardVoucherRequest(voucher_id, reason)`
- `SetTierRequest(tier, reason)`

**Files changed:**
- `backend/app/api/v1/endpoints/admin/admin_customers.py` — 3 new endpoints + import of Voucher/UserVoucher models
- `backend/app/schemas/admin_customers.py` — No changes (schemas already existed)

### Frontend: Customer Management UI

New "Manage" tab added to `CustomerDetailPage.tsx` with 4 action panels:

| # | Action | Component | Description |
|---|--------|-----------|-------------|
| 1 | **Approve Profile** | `ApproveProfileButton` | Shows only when `is_profile_complete=false`. Approves with confirmation dialog. |
| 2 | **Award/Deduct Points** | `AwardPointsDialog` | Inline form with points (+/-) and reason. Shows result after submission. |
| 3 | **Award Voucher** | `AwardVoucherDialog` | Dropdown of active vouchers + reason field. Fetches voucher list from `/admin/vouchers`. |
| 4 | **Set Tier Override** | `SetTierDialog` | Dropdown (bronze/silver/gold/platinum) + reason. Pre-selects current tier. |

**Additional changes:**
- Header now shows "Incomplete" badge when `is_profile_complete=false`
- "Total Earned" points displayed in profile balances
- Profile edit button text changed to "Edit Profile"
- Phone verified / profile complete status uses colored indicators

### Frontend: Store Settings Opening Hours UI

**Before:** Raw JSON textarea — non-technical users had to type `{"mon": "08:00-22:00"}`.

**After:** Per-day checkboxes (Mon–Sun) with time inputs for open/close.

| Feature | Detail |
|---------|--------|
| Day checkbox | Enable/disable each day independently |
| Open/Close time inputs | Native `<input type="time">` with 24h format |
| Disabled state | Time inputs greyed out when day unchecked |
| Bidirectional parsing | `parseOpeningHours()` converts `"mon": "08:00-22:00"` to state; `openingHoursToJSON()` converts back |
| Applied to | Both AddStoreForm and EditStoreForm |

**Files changed:**
- `frontend/src/components/pages/system/StoreSettingsPage.tsx` — New `OpeningHoursEditor` component + `DayHours` type + helper functions

### Frontend: Notifications Page Refactor

**Changes:**
- Removed "Send Now" button from draft broadcasts (SW-based client fetch replaces server-push)
- Removed `sendingId` state and `sendBroadcast()` function
- Updated info banner: Changed from "Phase 3 coming" warning to "SW-based push delivery" info
- Removed misleading `sent_count / opened` stats (always 0, no actual push delivery)
- Changed "Sent" label to "Published" for sent broadcasts
- Changed "Not sent" label to "Draft"

**Rationale:** The broadcast system is DB-only. No FCM/APNs integration exists. The PWA client uses Service Worker to periodically fetch new notifications from the DB. The "Send" button was misleading — it only flipped a status column.

**Files changed:**
- `frontend/src/components/pages/marketing/NotificationsPage.tsx`

### Frontend: Upload URLs Fixed (apiUpload helper)

**Before:** 4 files used hardcoded `fetch('/api/v1/upload/...')` — bypassed the `apiFetch` helper, didn't go through auth refresh, and had hardcoded paths.

**After:** New `apiUpload(path, token, formData)` helper in `merchant-api.tsx` that:
- Uses `NEXT_PUBLIC_API_URL` for base URL
- Sends auth header
- Handles token refresh on 401
- Does NOT set Content-Type (browser sets multipart/form-data boundary)

**Files changed:**
| # | File | Change |
|---|------|--------|
| 1 | `src/lib/merchant-api.tsx` | New `apiUpload()` export |
| 2 | `src/components/pages/marketing/InformationPage.tsx` | `fetch('/api/v1/upload/...')` → `apiUpload(...)` |
| 3 | `src/components/pages/marketing/PromotionsPage.tsx` | `fetch('/api/v1/upload/...')` → `apiUpload(...)` |
| 4 | `src/components/pages/marketing/RewardsPage.tsx` | `fetch('/api/v1/upload/...')` → `apiUpload(...)` |
| 5 | `src/components/pages/store-ops/InventoryPage.tsx` | `fetch('/api/v1/upload/...')` → `apiUpload(...)` |

### Frontend: Hardcoded URLs Fixed

| # | File | Before | After |
|---|------|--------|-------|
| 1 | `PWASettingsPage.tsx` | `fetch('https://app.loyaltysystem.uk/manifest.json')` + localhost fallback | Derives from `NEXT_PUBLIC_API_URL` (replaces admin. with app.) |
| 2 | `customer-app/src/lib/api.ts` | `process.env.NEXT_PUBLIC_API_URL ?? "https://app.loyaltysystem.uk/api/v1"` | `process.env.NEXT_PUBLIC_API_URL || "/api/v1"` |

### Frontend: Missing React Import Bug Fix

Two files used `React.CSSProperties` and `React.ChangeEvent` without importing React, causing runtime `ReferenceError`.

| # | File | Fix |
|---|------|-----|
| 1 | `src/components/pages/marketing/RewardsPage.tsx` | Added `React` to import |
| 2 | `src/components/pages/marketing/VouchersPage.tsx` | Added `React` to import |

### System Pages Audit: env vs DB

All 6 system pages verified — **none rely on env files for settings data**:

| Page | Data Source | Verdict |
|------|------------|---------|
| SettingsPage | `/admin/config` → `app_config` table via API | ✅ DB |
| PWASettingsPage | `/admin/config` + `/config` → `app_config` table | ✅ DB |
| StoreSettingsPage | `/admin/stores` → `stores` table | ✅ DB |
| LoyaltyRulesPage | `/admin/loyalty-tiers` → `loyalty_tiers` table | ✅ DB |
| AuditLogPage | `/admin/audit-log` → `audit_log` table | ✅ DB |
| CustomerDetailPage | `/admin/customers/{id}` → `users`/`loyalty_accounts` tables | ✅ DB |

The only `process.env` usage in the frontend is `NEXT_PUBLIC_API_URL` in `merchant-api.tsx` and `api.ts` — correct and intentional (tells the client where the backend is).

---

## Session 10b: Tables Ordering, Order Status on Tables, Order Type Filter (2026-04-21)

### Table Sorting

**Before:** Tables returned in database insertion order (no sorting).
**After:** Tables sorted by `is_active DESC` (active first), then `table_number ASC` (alphabetical).

**Backend change:**
- `GET /{store_id}/tables` — Added `ORDER BY CASE(is_active=true, 0, 1), table_number ASC`

### Active Order Indicator on Tables

Each table card now shows the active dine-in order (if any) with order number, status badge, total, and payment status. Clicking the order card navigates to the Orders page.

**Backend change:**
- `GET /{store_id}/tables` — Now queries `orders` table for each table_id where status is not `completed`/`cancelled`. Returns `active_order` field per table:
  ```json
  {
    "id": 42,
    "order_number": "ORD-20260421-0042",
    "status": "preparing",
    "order_type": "dine_in",
    "total": 45.50,
    "payment_status": "pending"
  }
  ```

**Frontend change:**
- `TablesPage.tsx` — Renders a clickable order card inside each table with status badge, total, and "Unpaid" indicator
- `MerchantTableItem` type — Added `active_order` optional field
- `page.tsx` — Wires `onViewOrder` callback to navigate to Orders page

**Purpose:** Service crew can see at a glance which tables have active orders and their status. This bridges the gap until POS integration is complete — crew can manually key orders into the POS system.

### Order Type Filter

Orders page now has a filter row with 4 buttons: "All Types", "Dine In", "Pickup", "Delivery".

**Backend change:**
- `GET /admin/orders` — Added `order_type` and `table_id` query parameters for filtering

**Frontend change:**
- `OrdersPage.tsx` — Added `orderType` prop and order type filter buttons
- `page.tsx` — Added `ordersOrderType` state, wired to fetch params and component props

### Order Status Flow (Verified Correct)

The backend enforces type-specific status transitions:

**Dine In (Flow B) — Pay after eating:**
```
pending → confirmed → preparing → ready → [payment] → completed
```
1. Customer confirms order
2. Kitchen prepares and serves food
3. Customer makes payment (payment_status set to "paid")
4. Order completed

**Pickup (Flow A) — Pay first:**
```
pending → paid → confirmed → preparing → ready → completed (after pickup)
```
1. Customer confirms and pays
2. Kitchen prepares food
3. Customer picks up → completed

**Delivery (Flow A) — Pay first:**
```
pending → paid → confirmed → preparing → ready → out_for_delivery → completed
```
1. Customer confirms and pays
2. Kitchen prepares food
3. Handed to 3rd-party delivery (or manual entry into delivery system)
4. Completed after delivery confirmed

**Frontend status buttons** now show only the valid next transitions based on current order type and status, plus a separate "Cancel Order" button. The modal also shows the flow description for the current order type.

**Backend validation rules:**
- Dine-in orders must be confirmed before they can be `preparing`
- Dine-in orders cannot be marked `completed` until `payment_status == "paid"`
- Pickup/delivery orders must be `paid` before they can be `confirmed`
- `cancelled` is valid from any non-terminal state

### Files Changed

| File | Changes |
|------|---------|
| `backend/app/api/v1/endpoints/admin/stores.py` | Tables endpoint: sorted + active order info |
| `backend/app/api/v1/endpoints/admin/admin.py` | Orders endpoint: `order_type` + `table_id` filters |
| `frontend/src/lib/merchant-types.ts` | `MerchantTableItem.active_order` field |
| `frontend/src/components/pages/store-ops/TablesPage.tsx` | Active order card, `formatRM` import, `onViewOrder` prop |
| `frontend/src/components/pages/overview/OrdersPage.tsx` | Order type filter, context-aware status buttons, flow descriptions |
| `frontend/src/app/page.tsx` | `ordersOrderType` state, `onOrderTypeChange`/`onViewOrder` wiring |

---

## Session 12: Image Cache-Busting (2026-04-22)

### Problem

After switching uploads from a named Docker volume to a host bind mount (Session 11), the Docker volume was recreated empty. Cloudflare cached 404 responses for all image URLs (`/uploads/items/*`, `/uploads/rewards/*`, `/uploads/banners/*`, etc.). Even after the bind mount was fixed and real files became accessible again, Cloudflare continued serving cached 404s to browsers.

### Solution

Added a `cacheBust()` helper to all image URLs across both frontends. Each image URL now gets `?v=timestamp` appended, making each request unique and bypassing Cloudflare's cached 404 responses.

### Helper Function

```typescript
export function cacheBust(url: string, ts?: number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ts ?? Date.now()}`;
}
```

### Admin Frontend Changes

| File | Change |
|------|--------|
| `frontend/src/lib/merchant-api.tsx` | Added `cacheBust()` export |
| `frontend/src/components/pages/marketing/RewardsPage.tsx` | `reward.image_url` → `cacheBust(reward.image_url)` |
| `frontend/src/components/pages/marketing/PromotionsPage.tsx` | `banner.image_url` → `cacheBust(banner.image_url)` |
| `frontend/src/components/pages/marketing/InformationPage.tsx` | `card.image_url` → `cacheBust(card.image_url)` |

### Customer PWA Changes

| File | Change |
|------|--------|
| `customer-app/src/lib/api.ts` | Added `cacheBust()` export |
| `customer-app/src/components/HomePage.tsx` | `bImg`, `card.image_url`, `imgSrc` → wrapped with `cacheBust()` |
| `customer-app/src/components/CartPage.tsx` | Cart item image URL → wrapped with `cacheBust()` |
| `customer-app/src/components/RewardsPage.tsx` | `resolveUrl()` → now calls `cacheBust()` |
| `customer-app/src/components/PromotionsPage.tsx` | `resolveUrl()` → now calls `cacheBust()` |
| `customer-app/src/components/InformationPage.tsx` | `resolveUrl()` → now calls `cacheBust()` |
| `customer-app/src/components/menu/ItemCard.tsx` | `imgSrc` → wrapped with `cacheBust()` |
| `customer-app/src/components/menu/ItemCustomizeSheet.tsx` | `imgSrc` → wrapped with `cacheBust()` |
| `customer-app/src/components/shared/HeroBanner.tsx` | `backgroundImage` URL → wrapped with `cacheBust()` |
| `customer-app/src/components/profile/AccountDetailsPage.tsx` | `avatar_url` → wrapped with `cacheBust()` |

### Verification

After hard refresh (`Ctrl+Shift+R`), all images now load correctly. Cloudflare returns `cf-cache-status: HIT` with HTTP 200 for all image URLs.

### Commit

`b861476` — Add cache-busting query param to all image URLs across both frontends

---

## Session 11: Order Flow Flexibility, Kitchen Display, Customer Management Fixes (2026-04-22)

### Overview

Major changes to support flexible order flows (Scenario B — manual workflows), a dedicated Kitchen Display page for service crew, and fixes to customer profile management.

### Backend: bcrypt/passlib Compatibility Fix

| # | Item | Description |
|---|------|-------------|
| 1 | `bcrypt==4.2.1` pin | `passlib 1.7.4` + `bcrypt 5.0.0` incompatibility caused `ValueError: password cannot be longer than 72 bytes` on login. Pinned bcrypt to 4.2.1. |

### Backend: Unified Order Status Transitions

**Before:** Rigid Flow A/Flow B gating — pickup/delivery forced through `pending → paid → confirmed`, blocking "Pay at Store" and "COD" workflows.

**After:** Flexible transitions for Scenario B (manual-only):

| Transition | Dine In | Pickup | Delivery |
|------------|---------|--------|----------|
| `pending → confirmed` | ✅ Always | ✅ Always | ✅ Always |
| `completed` (requires `paid`) | ✅ | ✅ | ✅ |
| `pending → paid` | ❌ | ✅ | ✅ |
| `confirmed → preparing → ready` | ✅ | ✅ | ✅ |
| `ready → out_for_delivery` | ❌ | ❌ | ✅ |

**Key changes:**
- Removed rigid Flow A gating from `PATCH /{order_id}/status`
- `pending → confirmed` now allowed for ALL order types
- `completed` requires `payment_status == "paid"` for ALL order types
- New `PATCH /admin/orders/{id}/delivery-tracking` for manual courier info
- Admin orders response now includes delivery fields

### Backend: Customer Profile Management Fixes

| # | Fix | Description |
|---|-----|-------------|
| 1 | `approve-profile` sets both flags | Now sets `phone_verified=True` AND `is_active=True` (was only phone_verified) |
| 2 | Rejects only when both true | Only rejects if already `phone_verified AND is_active` |
| 3 | Returns `note` field | If profile incomplete after approval, returns note explaining what's missing |
| 4 | Profile completeness = name only | `_is_customer_profile_complete()` now requires `phone_verified + name` only (email optional) |

### Admin Frontend: Orders Page Rewrite

| # | Feature | Description |
|---|---------|-------------|
| 1 | "Mark as Paid" button | For unpaid orders — triggers `PATCH /orders/{id}/payment-status` |
| 2 | Delivery tracking form | Courier name, phone, provider, ETA, tracking URL |
| 3 | UNPAID badges | Shown in table and detail modal |
| 4 | Payment info display | Shows method + status |
| 5 | Updated flow descriptions | Contextual for each order type |

### Admin Frontend: Kitchen Display Page (NEW)

**File:** `frontend/src/components/pages/store-ops/KitchenDisplayPage.tsx`

| # | Feature | Description |
|---|---------|-------------|
| 1 | Store selector | Must select a specific store — no "All Stores" (matches Tables page pattern) |
| 2 | Active orders only | Excludes completed/cancelled orders |
| 3 | Card-based grid | Color-coded by status |
| 4 | Status summary bar | Pending/confirmed/preparing/ready/out_for_delivery counts |
| 5 | Auto-refresh | Every 30 seconds with toggle |
| 6 | Quick actions | Confirm, Start Preparing, Ready, Out for Delivery, Complete, Mark Paid |
| 7 | Time warnings | >15min yellow, >30min red |
| 8 | Role access | Admin (1), Manager (2), Staff (3) |

### Admin Frontend: Customer Management UI Fixes

| # | Fix | Description |
|---|-----|-------------|
| 1 | ApproveProfileButton | Only shows when `phone_verified=false` (not `is_profile_complete=false`) |
| 2 | Info box | Shows when phone verified but name missing — directs to Edit Profile |
| 3 | "Phone Not Verified" label | Replaces confusing "Profile Pending Approval" |
| 4 | "No Tier" label | Replaces misleading "Pending Profile" in tier badge |
| 5 | Consistent descriptions | All text updated: "Approve to verify phone and activate account" |
| 6 | `total_points_earned` typed | Added to `CustomerDetail` interface, removed `as any` cast |

### Customer PWA: Payment Method Choice

| Order Type | Wallet | Alternative |
|------------|--------|-------------|
| Dine In | ❌ Fixed "Pay at counter" | — |
| Pickup | ✅ E-Wallet | "Pay at Store" |
| Delivery | ✅ E-Wallet | "Cash on Delivery" |

Only deducts wallet balance when `paymentMethod === 'wallet'`.

### Infrastructure: Upload Persistence Fix

**Before:** Named Docker volume (`fnb-uploads`) — lost on `docker compose down -v`.

**After:** Host bind mount (`./uploads:/app/uploads`) — survives container recreation, visible on host filesystem, backup-friendly.

**File:** `docker-compose.yml`

### Infrastructure: Management Script Rewrite

**File:** `/root/fnb-manage.sh`

Rewritten for Docker-first workflow:
- `start/stop/restart/status` → Docker compose commands
- `build/rebuild` → `docker compose build --no-cache`
- `build-backend/build-admin/build-customer` → Individual service rebuilds
- `shell [service]` → Container shell access
- `db-shell` → PostgreSQL shell
- `db-query "SQL"` → Run SQL queries
- `verify` → Full verification (containers + auth + DB + uploads)
- Removed all host-mode commands (venv, npm, alembic)

### Settings Page Fix

Removed duplicate `min_order` config field (was never used in order logic). Only `min_order_delivery` is enforced.

### Commits

| Commit | Message |
|--------|---------|
| `1f1b92c` | fix: pin bcrypt to 4.2.1 for passlib compatibility |
| `b907295` | feat: order flow flexibility, kitchen display, payment method choice |
| `57ad72a` | fix: approve-profile sets both phone_verified and is_active |
| `bf221a5` | fix: show correct incompleteness reason (phone vs name) |
| `54b58f8` | fix: profile complete requires name only, email is optional |
| `1195932` | fix: show correct profile incompleteness reason (phone vs name) |
| `2ef7921` | fix: consistent customer status labels — No Tier, Phone Not Verified |
| `5743342` | fix: add total_points_earned to CustomerDetail type, remove as any cast |
| `92406d6` | fix: remove unused min_order config, keep only min_order_delivery |
| `d6cd064` | fix: kitchen display requires store selection |
| `c7968b4` | fix: kitchen display store selector matches tables page pattern |
| `deee98a` | fix: switch uploads from named Docker volume to host bind mount |
| `c7968b4` | fix: kitchen display store selector matches tables page, placeholder images |
| *(Session 12)* | fix: consistent status labels, fnb-manage.sh rewrite, docs update |

---

## Session 13: PWA Audit & Fixes (2026-04-22)

### PWA Codebase Audit

Comprehensive audit of `customer-app/` codebase covering auth flows, menu/cart/checkout, orders/wallet/rewards, and PWA-specific functionality.

**Key findings (no critical bugs found — app is production-ready):**

| # | Area | Finding |
|---|------|---------|
| 1 | `apiFetch()` function | Dead code — defined but never called anywhere. Removed. |
| 2 | Token refresh loop risk | `_refreshFailed` flag added to prevent multiple simultaneous refresh attempts from causing infinite reload loops. |
| 3 | Token validation race condition | `AbortController` added to token validation `useEffect` to prevent stale responses from overwriting auth state after logout. |
| 4 | Cart sync | Already uses diff-based approach (Session 9 fix). Verified working. |
| 5 | OTP auto-submit | Works correctly — only triggers when all 6 digits entered and not loading. |
| 6 | Wallet top-up | Stub (expected — PG integration deferred). |
| 7 | Payment methods | Read-only stub (expected — PG integration deferred). |
| 8 | PWA shortcuts | Manifest shortcuts use `?page=` query params but URL parsing not implemented. Minor — shortcuts just open home page. |

### Fixes Applied

| # | Fix | File | Description |
|---|-----|------|-------------|
| 1 | Token refresh loop guard | `customer-app/src/lib/api.ts` | Added `_refreshFailed` module flag to prevent multiple reloads when refresh fails |
| 2 | AbortController for token validation | `customer-app/src/components/AppShell.tsx` | Token validation now uses `AbortController` to cancel in-flight requests on unmount/logout |
| 3 | Dead code removal | `customer-app/src/lib/api.ts` | Removed unused `apiFetch()` function |

### Commit

`0c5aeef` — fix(customer-app): prevent token refresh reload loops, add AbortController, remove dead apiFetch


---

## Session 14: AppShell Decomposition, Hash Routing, Admin Cleanup (2026-04-22)

### Customer PWA: AppShell Decomposition

**Before:** `AppShell.tsx` was a 914-line monolith containing auth flow, dashboard header, bottom nav, store modal, QR scanner, page routing, toast, and A2HS banner all inline.

**After:** Decomposed into 7 focused components:

| Component | Lines | Responsibility |
|-----------|-------|----------------|
| `AppShell.tsx` | 395 | Orchestration: offline banner, emergency popup, auth gate, toast, layout shell |
| `AuthFlow.tsx` | 220 | Splash → Phone → OTP → Profile → Done flow with loading overlay |
| `DashboardHeader.tsx` | 130 | Greeting, user name, tier badge, store selector, action icons grid |
| `BottomNav.tsx` | 120 | 5-item nav (Home/Menu/Rewards/Cart/Orders) with active state + cart badge |
| `StorePickerModal.tsx` | 200 | Store picker bottom sheet with search, distance sorting, selection UI |
| `auth/SplashScreen.tsx` | — | Existing component, restored from git |
| `auth/PhoneInput.tsx` | — | Existing component, restored from git |
| `auth/OTPInput.tsx` | — | Existing component, restored from git |
| `auth/ProfileSetup.tsx` | — | Existing component, restored from git |

**Key improvements:**
- Each component has a single responsibility
- `AppShell` no longer imports `lucide-react` directly — icons live in their respective components
- Auth state and handlers moved out of `AppShell` into `AuthFlow`
- No functional changes — all behaviors preserved

### Hash-Based URL Routing (Both Apps)

**Problem:** Both apps were pure SPAs with no URL-synced navigation. Browser back/forward buttons did nothing, and deep-linking to a specific page was impossible.

**Solution:** Sync `page` state with `window.location.hash`.

**Customer PWA:**
- `uiStore.setPage()` writes `window.location.hash = page`
- `AppShell` mounts a `hashchange` listener that calls `setPage(hash)` when user hits back/forward
- Initial page on load is read from hash

**Admin Frontend:**
- `handlePageChange()` writes `window.location.hash = page`
- `hashchange` listener restores page state on browser navigation
- Backward compatible: falls back to legacy `?page=` query param if hash is empty
- All internal navigation routes through `handlePageChange()` (no direct `setPage` bypasses)

**Benefits:**
- Browser back/forward now works across both apps
- Pages can be deep-linked (e.g., `https://app.loyaltysystem.uk/#orders`)
- Refresh restores the last viewed page

### Admin Frontend: Page.tsx Partial Decomposition

**Before:** `page.tsx` was 836 lines with inline `ChangePasswordModal` and `CustomizationManager` components.

**After:**
- Extracted `ChangePasswordModal.tsx` (~80 lines)
- Extracted `CustomizationManager.tsx` (~50 lines)
- `page.tsx`: 836 → 708 lines

### Admin Frontend: LocalStorage Auth Cleanup

**Problem:** 15 `localStorage` references for auth tokens (`fnb_token`, `fnb_refresh_token`, `fnb_role`, `fnb_user_type`) existed across 3 dead files — XSS risk and confusing maintenance.

**Files removed:**
- `frontend/src/lib/api.ts` — dead customer PWA API client
- `frontend/src/lib/auth.tsx` — dead customer PWA auth context
- `frontend/src/lib/admin-context.tsx` — dead admin context (state now lives in `page.tsx`)
- `frontend/src/lib/store.tsx` — dead app context

**Verification:** Grepped entire `frontend/src/` — zero imports of these modules. Admin auth already uses httpOnly cookies (`credentials: 'include'`).

**Remaining localStorage usage:** Only `sidebarCollapsed` preference in `Sidebar.tsx` (not auth-related).

### Build Verification

| App | Status |
|-----|--------|
| `customer-app` | ✅ `next build` passes (TypeScript + static generation) |
| `frontend` | ✅ `next build` passes (TypeScript + static generation) |

---

## Session 15 — Seed Script Audit & API Alignment (2026-04-22)

> Full audit of all 24 seed scripts in `scripts/seed/` after major backend order flow changes.
> See `docs/13-seed-script-audit.md` for complete details.

### Backend Fix

| File | Issue | Fix |
|------|-------|-----|
| `admin_customers.py:807` | Undefined `table` variable in reset exception handler | `table_name` |

### Management Script

| File | Issue | Fix |
|------|-------|-----|
| `scripts/fnb-manage.sh` | Referenced non-existent `verify_master_base_seed.py` | Updated to scripts 00–18 |

### Seed Script Fixes (Critical — Would Fail)

| # | Script | Issue | Fix |
|---|--------|-------|-----|
| 1 | `verify_seed_01_stores.py:78` | IndentationError | Removed leading space |
| 2 | `verify_seed_01_stores.py` | No QR codes generated for tables | Added `generate-qr` loop |
| 3 | `shared_config.py:50` | `STORE_IDS = [2,3,4,5,6]` | `[1,2,3,4,5]` |
| 4 | `verify_seed_02_menu.py` | Hardcoded store IDs 2,3 | Dynamic from `/stores` |
| 5 | `verify_seed_03_inventory.py` | Wrong `STORE_IDS`; flat list idempotency broken | Fixed IDs; uses `/inventory-categories` + flat item list |
| 6 | `verify_seed_04_staff.py` | All `store_id` values off by +1 | Updated to 1–5 |
| 7 | `verify_seed_06_rewards.py` | `"is_active"` in `RewardCreate` → 422 | Removed from POST |
| 8 | `verify_seed_10_register.py` | Customer count capped at 50 | Uses `data["total"]` |
| 9 | `verify_seed_12c_dinein.py` | Missing `qr_token` in scan | Added param |
| 10 | `verify_seed_13a_pickup_delivery.py` | PATCH `"confirmed"` after auto-confirm | Skipped; goes to `preparing` |
| 11 | `verify_seed_13b_dinein.py` | Voucher after confirm (needs `pending`) | Moved to before confirm |
| 12 | `verify_seed_14_claim_vouchers.py` | Wrong key `already_claimed` | `voucher_claimed` |
| 13 | `verify_seed_16_discounted_orders.py` | Vouchers from wrong data source | Loads from `state["claimed_vouchers"]` |
| 14 | `verify_seed_17_complete_discounted.py` | PATCH `"confirmed"` after auto-confirm | `statuses = ["preparing","ready","completed"]` |
| 15 | `verify_seed_18_feedback.py` | Wrong key `feedback` | `items` |

### Verification

- All 24 seed scripts: `python3 -m py_compile` ✅
- Backend files: `python3 -m py_compile` ✅
- Store ID convention: HQ=0, physical=1–5 ✅

---
