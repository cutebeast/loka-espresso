# FNB Super App v3 — Loka Espresso

**Status**: Live (Round 17, 2026-06-03) | **TS**: 0 errors | **E2E**: 23 passed, 0 failed

## Services

| Component | Dir | URL | Port |
|-----------|-----|-----|------|
| Backend | `v3/backend/` | — | 13800 |
| Admin Portal (120 pages) | `v3/admin-portal/` | admin.loyaltysystem.uk | 13830 |
| Staff Portal (16 pages) | `v3/staff-portal/` | staff.loyaltysystem.uk | 13820 |
| Customer PWA (26 pages) | `v3/customer-pwa/` | app.loyaltysystem.uk | 13810 |

All frontend + backend + DB served via Caddy HTTPS. Old v1/v2 folders removed.

## Quick Start

```bash
# Backend
cd v3/backend && uvicorn app.main:app --reload --port 13800

# Frontends
cd v3/admin-portal && npm run dev    # → localhost:13830
cd v3/staff-portal && npm run dev    # → localhost:13820
cd v3/customer-pwa && npm run dev    # → localhost:13810

# Tests
cd v3/e2e-tests && python3 -m pytest -v
```

## Production (PM2)

```bash
pm2 start npm --name admin-portal-v3   --cwd v3/admin-portal   -- start -- -p 13830
pm2 start npm --name staff-portal-v3   --cwd v3/staff-portal   -- start -- -p 13820
pm2 start npm --name customer-pwa-v3   --cwd v3/customer-pwa   -- start -- -p 13810
pm2 restart v3-backend   # via existing config
```

## Admin Portal — 120 pages

Full CRUD dashboard covering: Stores, Menu (items, categories, allergens, dietary tags, tax), Inventory (items, categories, suppliers, stocks, movements, POs), Orders, Customers, Staff (profiles, shifts, attendance, tips, roles), Loyalty (tiers, accounts, ledger, settings), Marketing (vouchers, rewards, promotions, surveys, campaigns, referrals, checkins), Content (events, products, info cards, system pages, PWA splash), Notifications (templates, broadcast), Reservations, Tables, Equipment (CRUD + reports), Feedback, Reports, Audit Log, Translations (PWA + staff UI), Settings (platform config, version control), Admins + Roles, Refunds.

**Architecture**: `layout.tsx` JWT auth with idle timeout, Sidebar with 56 nav items, Pure CSS (8 files), `api.ts` with token refresh + upload, BrandProvider with usePathname trigger.

## Staff Portal — 16 pages

| Route | Purpose |
|-------|---------|
| `/login` | Store selector + name/email login |
| `/` | Dashboard (3-group grid, 30s polling) |
| `/pos` | POS terminal — menu, cart, checkout, tips |
| `/orders` | Order list with filters |
| `/kitchen` | KDS kanban (5s polling, audio alerts) |
| `/kitchen/[id]` | Order detail + status actions |
| `/tables` | Table management + QR codes |
| `/reservations` | Reservation confirm/cancel/no-show |
| `/time-clock` | Clock in/out/break with PIN |
| `/wallet` | Customer wallet top-up + rewards |
| `/profile` | Change password/PIN |
| `/equipment` | Daily check + issue reporting |
| `/inventory` | Stock counts + adjustments |
| `/wastage` | F&B waste reporting |
| `/garbage` | Garbage disposal tracking |
| `/grease-trap` | Grease trap cleaning |

**Architecture**: `AuthProvider.tsx` wraps app with JWT + idle timeout + 60s warning. `api.ts` with token refresh. All forms use `.form-input` CSS class.

## Customer PWA — 26 pages

Hash-based SPA. Guest mode (limited access) + authenticated (full access). Passwordless phone + OTP login with auto-registration.

| Hash | Page |
|------|------|
| `#home` | Home with featured items |
| `#menu` | Menu browsing + item customization |
| `#cart` | Cart with modifiers |
| `#checkout` | Order placement (delivery/pickup/dine-in) |
| `#orders` | Order history + tracking |
| `#order-detail` | Single order detail |
| `#rewards` | Rewards catalog + redemption |
| `#profile` | Profile dashboard |
| `#wallet` | Wallet top-up + payment methods |
| `#history` | Loyalty + wallet transaction history |
| `#promotions` | Promo banners + claim + surveys |
| `#information` | Info cards |
| `#my-rewards` | My rewards + vouchers |
| `#my-card` | Loyalty tier card |
| `#account-details` | Edit profile + avatar upload |
| `#payment-methods` | Saved payment methods |
| `#saved-addresses` | Address CRUD |
| `#notifications` | Push notifications |
| `#help-support` | Contact + feedback |
| `#legal` | Terms + privacy |
| `#settings` | Language, about |
| `#referral` | Referral code + stats |
| `#reservations` | My reservations |
| `#events` | Events + RSVP |
| `#checkin` | Daily check-in + streak |

**Architecture**: `AppShell.tsx` hash router, `mapUrl` in request interceptor, Zustand stores (auth, ui, cart, wallet, order, config, locale), Pure CSS with LOKA tokens, 4-tier translation fallback.

## Design Decisions

1. **Separate Identity Domains**: Customer ≠ Staff ≠ Admin, unified via `iam_principals`
2. **Pure CSS**: CSS variables, no frameworks
3. **Client-Side Auth**: localStorage JWT with auto-refresh
4. **Wallet**: Double-entry ledger, no mutable balance
5. **Loyalty**: Points ledger with FIFO expiry
6. **DB-Driven Config**: Feature flags in `platform_config`
7. **Passwordless Customer Auth**: Phone + OTP, auto-register on first login

## Verification (Round 17)

- TypeScript: 0 errors across all 3 portals
- ESLint: 0 new errors/warnings
- All 3 domains: HTTPS 200
- PWA: 26/26 endpoints verified
- E2E: 23 passed, 0 failed
