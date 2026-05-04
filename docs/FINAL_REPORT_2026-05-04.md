# Final Report — 2026-05-04

## Summary

**Total work:** 17 commits across backend, admin frontend, PWA, tests, docs, and scripts.

| Area | What changed |
|------|-------------|
| Backend | 7 fixes (NameError, auth gaps, schema bypasses, endpoint bugs) |
| Admin Frontend | State management refactor (30→0 prop drilling), wallet add/deduct, 16 alert→console.error |
| PWA | innerHTML XSS fix, silent catch logging, ESLint cleanup |
| Tests | 70 passing (17 existing + 53 new integration tests) |
| Scripts | 28 broken /stores paths fixed → /admin/stores |
| Docs | 073-endpoint-audit.md with corrected dead endpoint list |

---

## Completed

### 1. Audit Fixes (Rounds 1-3)
- Critical: `order_status.py` NameError (`now_utc`/`ensure_utc` import)
- `BroadcastUpdate` schema (prevents status bypass)
- `MarketingCampaignUpdate.total_recipients` removed
- `OrderCreate.created_at` removed
- `last4` validator on `PaymentMethodCreate`
- JWT `issuer`/`audience` on `_blacklist_token` and `check_session`
- Password message: "6" → "8"
- 16 `alert()` → `console.error()`
- `isNaN` guards on all `parseFloat` calls
- `ListCard.tsx` innerHTML → React JSX
- `DataTable key={idx}` → `row.id ?? idx`
- `WalletTopUpPage` modal nesting fixed

### 2. State Management Refactor
- 4 Zustand stores created, 3 old hooks deleted
- `page.tsx`: 425→333 lines
- `AdminModals`: 0 props (reads directly from stores)
- `token` prop removed from all 30+ pages
- All 3 projects typecheck clean (0 errors)

### 3. Wallet Add/Deduct (New Feature)
- `CustomerDetailPage` > Manage tab: `WalletAdjustDialog`
- Positive amount = top-up via `/admin/wallet/topup`
- Negative amount = deduct via `/admin/wallet/deduct`
- HQ-only access (`userType === 1`)
- Deduct moved to `/admin/wallet/deduct` for consistency

### 4. Endpoint Audit
- 161 routes registered
- 110 live (verified by cross-referencing frontend + seed scripts)
- ~49 dead (corrected from initial 55 — 6 saved by seed scripts)
- 4 external webhooks (intentional)
- 0 auth gaps

### 5. Seed Scripts
- 28 broken `/stores` paths fixed → `/admin/stores`
- 6 "dead" endpoints corrected (used by seed scripts)

### 6. Test Suite
- **70 tests passing, 1 skipped**
- 53 new integration tests hitting live API endpoints
- Covers: public (14), auth (4), customer (11), admin (14), auth guards (4), critical fixes (5)

---

## Dead Endpoints — Recommendations

### 🟢 Should Build (high value, data model ready)

| Endpoint | Feature | Priority |
|----------|---------|----------|
| Campaigns CRUD (5) | Admin CRM > Campaigns page | P2 |
| `/admin/broadcasts/{id}/send` | Send button on NotificationsPage | P1 |
| Reports: loyalty, inventory, popular, CSV (4) | Additional tabs on SalesReportsPage | P1 |
| Low stock alerts | Badge on InventoryPage | P1 |
| Clock-in/out (2) | POS Terminal buttons | P2 |
| Staff shifts | New ShiftsPage | P2 |
| Favorites PWA (3) | "Save for Later" on menu items | P2 |

### 🔴 Safe to Delete (redundant — newer alternatives exist)

All 14 duplicate/legacy endpoints can be removed:
- `/promos` → `/promos/banners` exists
- `/menu/items/search` → PWA filters client-side
- `/menu/items/popular` → `/menu/items?featured=true` exists
- `/menu/stores` → `/content/stores` exists
- `/content/notifications` → `/notifications` exists
- `/vouchers/apply` → `/checkout` flow handles this
- `/vouchers/use/{code}` → `/admin/customers/{id}/use-voucher/` exists
- `/order-tracking/{id}/track` → `/orders/{id}` has timeline
- `/users/me` DELETE → dangerous, no UI
- `/loyalty/tiers` (public) → `/admin/loyalty-tiers` exists
- `/splash` GET/PUT/DELETE → static PWA page
- `/upload/files/{path}` → Caddy serves `/uploads/`
- `/admin/pwa/version` → `/content/version` exists
- `/admin/users/{id}` → `/admin/customers/{id}` exists

### 🟡 Keep (backend-only, intentional)
System reset, init-hq, backfill-ledger, cron expire, 4 webhooks — these serve dev/ops/integration purposes.

---

## Not Yet Done (needs user input)

| Item | Reason |
|------|--------|
| Delete 14 dead endpoints | Requires confirming no hidden callers |
| Build admin Campaigns UI | Needs sidebar structure decision |
| Build PWA Favorites | Needs design for menu item save UX |
| Build admin Clock-in/Out | Needs decision on POS vs Staff page |
| Build admin Low Stock Alerts | Straightforward — badge on InventoryPage |
| Build admin Broadcast Send | Straightforward — button on NotificationsPage |
| Build admin Reports tabs | Straightforward — add tabs to SalesReportsPage |
