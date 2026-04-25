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
