# FNB Super App - Documentation Index
**Last Updated:** 2026-04-28 | **Status:** Session 5 (Round 7) admin frontend overhaul complete — 18 phases, all pages verified, all drawer forms consistent, mobile service crew view, QR client-side generation, zero image URL inputs

---

## Current State

The codebase currently includes:

- `backend/` FastAPI API with PostgreSQL, Alembic, JWT auth, OTP flow, wallet, order, loyalty, marketing, and webhook endpoints
- `frontend/` merchant/admin Next.js app
- `customer-app/` customer PWA Next.js app
- `scripts/seed/` modular API-driven seed and verification scripts
- mock provider scripts under:
  - `scripts/3rdparty_pg/`
  - `scripts/3rdparty_delivery/`
  - `scripts/external_pos/`

Current pre-provider posture:

- OTP delivery still uses backend-side OTP bypass/testing flow until Twilio integration
- wallet topup and provider payment flows still use mock PG tooling
- delivery lifecycle still uses mock delivery tooling
- external POS flow still uses mock POS tooling
- docs below reflect the current internal contract before real PG, Twilio, delivery, and POS integrations

---

## Recommended Reading Order

### Core System
1. **[01-architecture.md](01-architecture.md)** - system architecture, runtime topology, current integration boundaries
2. **[02-database-schema.md](02-database-schema.md)** - schema overview
3. **[03-api-reference.md](03-api-reference.md)** - current API contract reference

### Verification & Operations
4. **[04-testing-guide.md](04-testing-guide.md)** - current test accounts, seed flow, verification workflow
5. **[07-deployment-guide.md](07-deployment-guide.md)** - deployment and local rebuild workflow
6. **[09-troubleshooting.md](09-troubleshooting.md)** - runtime and seed troubleshooting

### Detailed Schema
7. **[02a-acl.md](02a-acl.md)** - access control schema
8. **[02b-users.md](02b-users.md)** - users, OTP, device tokens, token blacklist
9. **[02c-stores.md](02c-stores.md)** - stores and tables
10. **[02d-menu.md](02d-menu.md)** - menu and inventory
11. **[02e-orders.md](02e-orders.md)** - orders and payments
12. **[02f-loyalty.md](02f-loyalty.md)** - loyalty, rewards, wallet
13. **[02g-marketing.md](02g-marketing.md)** - vouchers, promos, surveys, information cards
14. **[02h-staff.md](02h-staff.md)** - staff management
15. **[02i-social.md](02i-social.md)** - referral and favorites
16. **[02j-system.md](02j-system.md)** - config, notifications, audit

### Reference & Audit
17. **[05-alignment-verification.md](05-alignment-verification.md)** - current alignment summary and known drift boundaries
18. **[06-improvements-log.md](06-improvements-log.md)** - historical implementation log, not a launch signoff
19. **[10-frontend-audit.md](10-frontend-audit.md)** - frontend architecture audit and improvement recommendations
20. **[11-ui-ux-guidelines.md](11-ui-ux-guidelines.md)** - brand colors, theming, and component guidelines
21. **[12-environment.md](12-environment.md)** - consolidated environment variable reference
22. **[08-post-pwa-roadmap.md](08-post-pwa-roadmap.md)** - planned features and enhancements
23. **[17-api-audit.md](17-api-audit.md)** - API endpoint audit and modularity plan
24. **[18-css-architecture.md](18-css-architecture.md)** - Pure CSS architecture and design tokens (no Tailwind)
25. **[19-responsive-design-guide.md](19-responsive-design-guide.md)** - Responsive breakpoints and mobile-first patterns

---

## Important Notes

- Do not treat historical "100% complete" notes in older documents as launch approval.
- The source of truth for rebuild/start workflow is now:
  - `scripts/fnb-manage.sh`
- The source of truth for modular seeding is now:
  - `scripts/seed/`
- The source of truth for mock integrations is now:
  - `scripts/3rdparty_pg/`
  - `scripts/3rdparty_delivery/`
  - `scripts/external_pos/`

---

### Reference & Audit (continued)
26. **[20-admin-frontend-guide.md](20-admin-frontend-guide.md)** - Admin frontend component architecture, CSS organization, and page breakdown
27. **[21-pwa-ordering-journey.md](21-pwa-ordering-journey.md)** - Customer PWA ordering flows (dine-in, pickup, delivery)
28. **[22-db-audit-session4.md](22-db-audit-session4.md)** - Session 4 DB audit: model fixes, new tables, customization JSON migration
29. **[session-log-2026-04-26.md](session-log-2026-04-26.md)** - Session 4 implementation log
30. **[23-pwa-uiux-audit.md](23-pwa-uiux-audit.md)** - PWA UI/UX audit: 17 findings across 4 priority levels, all critical/high issues resolved
31. **[session-log-2026-04-27.md](session-log-2026-04-27.md)** - Session 5: admin frontend API/CSS/QR/mobile/UI overhaul (18 phases)

---

## Current Priorities

1. Keep internal contracts stable.
2. Keep seed scripts aligned with current APIs.
3. Keep docs aligned with current code and runtime workflow.
4. Use mock provider scripts only as temporary integration simulators.
5. Real PG, Twilio, delivery-provider, and external POS integrations are the next phase.

---

## Session 4 Audit (April 2026)

### DB Model Fixes
- `CartItem.store_id` — clarified as fulfillment store (universal menu has no per-store items)
- `device_tokens` — column length fix for token strings
- `checkout_tokens` — added proper FK constraints (`user_id→users`, `store_id→stores`)

### Voucher Recovery Fix
- Reserved-status voucher pattern: `reserved → used` lifecycle prevents double-apply during checkout

### Pydantic Validation
- Added request/response schema validation to 10 endpoint files (cart, checkout, orders, vouchers, rewards, staff, menu, inventory, config, uploads)

### Router Prefix Consistency
- Standardized `prefix` and `tags` across 8 admin routers (`admin_banners`, `admin_broadcasts`, `admin_loyalty_tiers`, `admin_pwa_mgmt`, `admin_system`, `admin_reports_store`, `admin_customer_actions`, `admin_customer_wallet`)

### Hardcoded Path Fixes
- `manifest.json` — replaced hardcoded domain with `NEXT_PUBLIC_APP_DOMAIN` env var

### New CRUD Endpoints
- 7 new endpoints added: admin customer wallet adjustments, inventory ledger entries, delivery zone management, allergen management, tax rate management, modifier group management, store-level delivery zone assignment

### CSS Split: admin-extra.css → 14 Per-Page Files
- Monolithic `admin-extra.css` split into: `dashboard.css`, `orders.css`, `menu-admin.css`, `tables-admin.css`, `kitchen-display.css`, `inventory-admin.css`, `staff-admin.css`, `vouchers.css`, `rewards.css`, `promotions.css`, `customers.css`, `feedback.css`, `notifications.css`, `wallet-topup.css`

### Mobile-First Responsive Conversion
- Both admin and PWA frontends converted to mobile-first CSS (`min-width` breakpoints)
- Breakpoints: 768px (tablet), 1024px (desktop)
- Admin: sidebar hidden on mobile, bottom nav visible, single-column layouts
- PWA: full viewport, no phone mockup frame

### Environment Variable Externalization
- All hardcoded domains/URLs replaced with env vars across both frontends
- Admin: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_ADMIN_DOMAIN`, `NEXT_PUBLIC_LOGO_URL`, `NEXT_PUBLIC_API_BASE_URL`
- PWA: `NEXT_PUBLIC_API_PROXY`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_OTP_BYPASS`

### New Composite DB Indexes
- 4 composite indexes added: `orders(store_id, created_at)`, `orders(user_id, created_at)`, `cart_items(user_id, store_id, item_id, customization_hash)`, `audit_log(created_at, method)`

### New DB Tables (Migration 8d56)
- `allergens` — allergen definitions for menu items
- `delivery_zones` — delivery zone radius/pricing per store
- `tax_rates` — tax rate configuration per store/region (created in 7c34, indexed in 8d56)
- `modifier_groups` — grouped customization modifiers
- `modifier_options` — modifier option values with price adjustments
- `menu_item_allergens` — junction table linking menu items to allergens
- Plus 3 tables from Migration 7c34: `tax_categories`, `recipe_items`, `reservations`

### Component Decomposition
- 10 new TSX files extracted from monolithic components: `AuthFlow.tsx`, `DashboardHeader.tsx`, `BottomNav.tsx`, `StorePickerModal.tsx`, `CheckoutPanel.tsx`, `CartPanel.tsx`, `TableCard.tsx`, `CustomerInfo.tsx`, `WalletPanel.tsx`, `OrderHistory.tsx`

### PWA CSS Splitting
- 9 new focused CSS files: `cart.css`, `checkout.css`, `orders-list.css`, `order-detail.css`, `profile.css`, `wallet.css`, `my-rewards.css`, `history.css`, `qr-scanner.css`

### Rename
- `staff.store_rel` → `staff.store` (relationship attribute rename for clarity)
