# Improvements Log

> Summary of major improvements applied to the FNB Super App.

See `_archive/06-improvements-log-full.md` for detailed chronological history.

## Latest Improvements (April 2026)

- Modularized oversized CSS files (orders.css, account.css, menu-browse.css split into focused files)
- Modularized backend endpoint files (orders.py, admin_customers.py, admin.py split into focused files)
- Removed Tailwind references from documentation (project uses pure CSS, no framework)
- Deleted unused types.ts and dead route stubs from admin frontend
- Renamed misleading CSS files (home- prefix removed from non-home page styles)
- Added composite database indexes for performance
- Removed deprecated loyalty_discount column from orders table
- Extracted modal components from monolithic Modals.tsx
- Added responsive breakpoints to admin frontend (mobile/tablet/desktop)
- Added responsive breakpoints to customer PWA
- Added MobileBottomNav for service crew mobile access
- Fixed inline styles in checkout components (converted to CSS utility classes)
- Frontend lint config fixed
- Backend cart/checkout pricing includes customization adjustments
- Cart uniqueness handles customization_option_ids (application-level; DB constraint added in Session 2)
- OTP bypass auto-approve removed
- Idempotency scoped by Authorization token hash
- Webhook empty API key rejected
- Wallet deduct uses atomic balance check
- Service worker update behavior reduced (visible prompt still needed)
- Customer PWA uses selectedStore.id for cart/checkout (Home/Menu browse still uses universal menu)
- Cart notes persist to checkout
- QR scanner opens from cart via event dispatch
- Admin shell uses .sidebar CSS class
- DataTable uses .data-table responsive class
- Database CheckConstraints added for non-negative prices/quantities
- Promotion popup renamed from EmergencyPopup with dedicated CTA fields
- Runtime config admin endpoint validates keys and audit-logs changes
- Audit log model expanded with method/path/status_code/user_agent/request_id
- Destructive admin endpoints gated by environment + confirmation
- Upload endpoints validate magic bytes; avatar upload validates type/size
- Staff create/reset no longer returns plaintext temp passwords
- **Universal Menu DB Refactor** (`apr2026_universal_menu_v7`):
  - Removed `store_id` from `menu_categories` and `menu_items` tables
  - Removed `UNIVERSAL_MENU_STORE_ID=0` workaround from PWA menu endpoints
  - PWA menu endpoints moved from `/stores/{store_id}/...` to `/menu/...`
  - Admin menu endpoints moved from `/admin/stores/{store_id}/...` to `/admin/...`
  - `CartItem.store_id` and `Order.store_id` now clearly represent the *fulfillment store* only
  - Eliminates the schema-business contradiction that caused repeated confusion
- Dietary filtering uses parameterized JSONB instead of string interpolation
- Alembic migration chain restored with Session 2 schema migrations
- **CSS Modularization & Inline Style Cleanup**:
  - Deleted 100% duplicate residue files (`orders.css` 38KB, `account.css` 23KB, `menu-browse.css` 12KB)
  - Extracted `.notif-*` → `notifications.css`, `.rewards-*` → `my-rewards.css`
  - PWA inline styles: 275 → 6 (only genuinely dynamic values)
  - Admin inline styles: ~120 → 30 (mostly dynamic runtime values)
  - Migrated 25+ components to dedicated CSS classes
  - New CSS modules: `modals.css`, `notifications.css`, `sub-components.css`, `admin-extra.css`
- **JWT & Runtime Security Hardening**:
  - Tokens removed from JSON response bodies (`verify-otp`, `login-password`, `refresh`); httpOnly cookies only
  - Added `@limiter.limit("30/minute")` to `/auth/refresh`
  - Blacklist decode failures logged at `warning` level; DB errors propagate
  - `PUT /admin/config` enforces `ALLOWED_CONFIG_KEYS` allowlist; `otp_bypass_code` removed from allowlist
  - `GET /admin/config` filters sensitive keys; audit log redacts sensitive values as `***REDACTED***`
  - CORS restricted to explicit methods and headers (was `"*"`)
  - `JWT_REFRESH_EXPIRE_DAYS` configurable via env (default 30)
  - Added database index `ix_token_blacklist_expires_at` for efficient cleanup
- **Seed Script Security**:
  - Removed hardcoded `admin123` default (now requires `ADMIN_PASS` env var)
  - Removed weak OTP fallback codes (`123456`, `000000`, `111111`)
  - Added `scripts/seed/seed_state.json` to `.gitignore`
  - All seed scripts aligned with universal menu endpoints (`/menu/items`, `/menu/categories`, `/admin/items`, `/admin/categories`)

## Epochs

1. **Initial Setup** — Backend API, database schema, admin dashboard
2. **PWA Launch** — Customer PWA, ordering flows, loyalty system
3. **Deep Audit (April 2026)** — Modularity, responsive design, DB optimization, naming conventions
4. **Session 3 (April 2026)** — Bug fixes, alembic consolidation, backend split, service crew mobile

### Session 3 Changes

**Critical Bug Fixes:**
- Fixed broadcast send crash (`Notification` model import missing in `admin_system.py`)
- Changed `users.user_type_id` / `role_id` FKs from `CASCADE` to `RESTRICT` (prevents accidental user-type deletion)
- Fixed PWASettingsPage stray text render (line 252)
- Fixed DataTable duplicate `<thead>` in expandable rows
- Fixed HistoryPage broken CSS classes (`space-y-2`, `bg-green-50`, etc.) — added to `utilities.css`
- Fixed admin login not returning `access_token` in response body (frontend checked for it)

**Alembic Consolidation (57 files → 5):**
- Single consolidated baseline `5a81abc564c3_baseline.py` with all Phase 6 DB fixes baked in
- Deleted 11 incremental migrations, `_archived/` (39 files), unused `helpers.py`
- New baseline includes: RESTRICT on user FKs, payment_status CHECK, device token length fix, 30+ missing indexes

**Backend API Improvements:**
- Renamed `admin_reports_legacy.py` → `admin_reports_store.py`
- Split `admin_system.py` (904 lines) → 5 files: `admin_banners`, `admin_broadcasts`, `admin_loyalty_tiers`, `admin_pwa_mgmt`, `admin_system` (core)
- Removed duplicate public `GET /banners` (canonical is in `pwa_promos.py`)
- Gated `GET /admin/otps` behind `ENVIRONMENT != production`
- Moved `POST /auth/change-password` from `admin_staff.py` to `auth.py` with audit logging
- Added pagination to `/favorites`, `/notifications`, `/wallet/transactions`, `/rewards`

**Admin Frontend:**
- Deleted dead code: `StatCard.tsx`, `PageHeader.tsx`, unused `pageStyles` from `theme.ts`
- Fixed `Modals.tsx` re-export of `StatCard` to point to `Card.tsx`
- Logo containers (`.s-0`, `.s-3`) background changed from white to `#384b16` (visible with white-text logo)
- Fixed logo responsive overlap — `Image fill` overridden with `position: relative !important`
- Moved mobile CSS from JS `document.head.appendChild(style)` to `admin-extra.css` @media block (5 pages: POS Terminal, Tables, Orders, Wallet Top-Up, Inventory)
- Added `tables` to service crew page visibility (user_type_id=3)
- Added `Tables` tab to `MobileBottomNav` for service crew mobile access

**PWA Customer App:**
- Removed `formatPrice` duplication from 9 files (all import from `lib/tokens.ts`)
- Removed runtime cache-busting from `resolveAssetUrl` (was defeating browser cache)
- Added 17 missing exports to `components/ui/index.ts` barrel (15 → 32)
- Deleted unused `auth/PhoneNumberField.tsx`
- Added missing CSS utility classes: `space-y-2`, `space-y-3`, `bg-green-50`, `bg-red-50`, `text-green-600`, `text-red-500`

**Database Schema Sync:**
- Added 33 missing columns across 12 tables (stores, loyalty_tiers, store_tables, payment_methods, permissions, roles, user_types, wallets, inventory_categories, referrals, cart_items, users, audit_log, notifications, feedback, information_cards)
- Created missing `checkout_tokens` table
- Added `paid` and `authorized` to `payments.status` CHECK constraint
- Stamped alembic to `5a81abc564c3`

**Documentation:**
- Fixed port references in 09-troubleshooting.md (8765→3002) and 07-deployment-guide.md
- Fixed table count in 02-database-schema.md (35→54 tables)
- Marked Phase 2 (device tokens) as COMPLETED in roadmap
- Updated 02a-acl.md with service crew page visibility and Tables access
- Removed `OTP_BYPASS_ALLOWED` from `docker-compose.yml`
- Cleared `WEBHOOK_API_KEY` and `WEBHOOK_SIGNING_SECRET` placeholders in `.env` / `.env.example`
- Deleted empty `backend/seeds/` directory

**CSS Modularization (admin frontend):**
- Moved 3 `@keyframes` animations from component `<style>` tags to `admin-extra.css` (Drawer, Modal, Sidebar tooltip)
- Moved `Sidebar.tsx` tooltip CSS from `dangerouslySetInnerHTML` to `admin-extra.css` with CSS custom properties
- Extracted `Button.tsx` CSS-in-JS to `.btn-admin` CSS classes (4 variants × 3 sizes)
- Extracted `Input.tsx`/`TextArea.tsx` CSS-in-JS to `.input-field`/`.textarea-field` CSS classes
- Created shared `.form-label`/`.form-hint` CSS classes, replacing 9 duplicated style constants across 6 files (TablesPage, StoreSettingsPage, VouchersPage, SurveysPage, LoyaltyRulesPage, OrdersPage)
- Removed unused `THEME` imports from 8 files (Sidebar, TablesPage, StoreSettingsPage, VouchersPage, SurveysPage, LoyaltyRulesPage, OrdersPage, Button)
- Zero JS-injected `<style>` tags remain in admin frontend

### Phase 23 (2026-04-29 to 2026-04-30)
- **Guest Journey:** restricted pages trigger sign-in sheet instead of navigating; cart/rewards public browsing; GuestGate checks `isAuthenticated`
- **Store Management Consistency:** all pages use `fa-toggle-on`/`fa-toggle-off` in Actions column; menu cards compact; category soft-delete
- **Referral System:** wallet credit → loyalty points; `ReferralPage` on PWA with share/copy; config keys `referral_reward_points` + `referral_min_orders`
- **Content Types:** `promotion` → `event`; separate Experiences + Products carousels; admin filter dropdown; type-specific upload folders
- **DOB + Customization:** `customers.date_of_birth`; `customization_options.option_type` with type dropdown
- **Upload System:** 9 dedicated endpoints → 9 folders (zero orphans); Pillow image processing (resize 1200px, JPEG only, strip EXIF); MIME type registration
- **Image Audit:** all webp→jpg converted; DB paths fixed; corrupt files removed; Cloudflare cache bypassed
- **CSS:** promos white text + Playfair; overlay `display:none` fix; cart qty/remove restructured; menu card compact + fallback images
- **Backend fixes:** `_blacklist_token`, `_normalize_phone`/`_validate_phone`, OTP constants, `require_role` Customer guard, DeviceToken→CustomerDeviceToken, FK migrations
- **Dead code removed:** `AddStaffModal.tsx`, `UserAddress` model, `ItemCard.tsx`
