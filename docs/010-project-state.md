# Loka Espresso — Project State (2026-05-04)

> Phase 3 Complete. All 26 PWA pages v2 self-contained. Premium Turkish coffee brand aesthetic. Full API endpoint audit: 175 endpoints, zero regressions. Redis rate limiting active. Dine-in flow fully implemented. Pull-to-refresh fixed. Security audited (3 rounds). ESLint 0 errors / 0 warnings. Admin frontend role-based access with notification template management.

---

## 1. System Overview

| Component | Stack | URL |
|---|---|---|
| Backend | FastAPI + PostgreSQL + Alembic + Redis | `:3002` |
| Admin Frontend | Next.js 16 (Hash router, pure CSS) | `admin.loyaltysystem.uk` |
| Customer PWA | Next.js 16 (Zustand, pure CSS, 26 pages) | `app.loyaltysystem.uk` |
| Database | PostgreSQL 16 | `:5433` |
| Cache | Redis 7 (Alpine) | `:6379` |

**Docker deployment** with Caddy reverse proxy. Auto-migration on deploy via `docker-entrypoint.sh`. Redis middleware with auto-fallback to in-memory when unavailable.

---

## 2. Brand Design System

### Color Palette — Turkish Premium

| Role | Value | Variable |
|---|---|---|
| Primary (Turkish Olive) | `#3B4A1A` | `var(--loka-primary)` |
| Gold Accent | `#C9A84C` | `var(--loka-accent-gold)` |
| Copper Accent | `#C4893A` | `var(--loka-accent-copper)` |
| Brown (Turkish Coffee) | `#4A2210` | `var(--loka-accent-brown)` |
| Page Background | `#F2EEE6` | `var(--loka-bg)` |
| Card Background | `#FFFDF8` | `var(--loka-bg-card)` |
| Text Primary | `#1E1B18` | `var(--loka-text-primary)` |

**Tier Colors**: Bronze `#A0783A→#7A5828` · Silver `#B0A9A0→#8A8278` · Gold `#D4AF37→#B8942A` · Platinum `#8A9AB0→#5A6A80`

**Typography**: `Playfair Display` (headings) + `Inter` (body) via `--font-display` / `--font-sans`

**SSOT**: `src/styles/variables.css` + `src/lib/tokens.ts` — always synchronized. Zero hardcoded hex in any v2 CSS.

---

## 3. Icon System

- **All lucide-react v1.8.0** — 73 imports across 40+ components
- **Zero FontAwesome** in customer PWA
- **Icon colors** use `LOKA` tokens from `@/lib/tokens`

---

## 4. CSS Architecture

- **26 self-contained `*-v2.css` files** — one per page
- **14 shared CSS files** — `components.css`, `info-cards.css`, `globals.css`, etc.
- All CSS files imported in `src/app/globals.css` — zero dead imports
- **Deleted legacy**: `profile.css`, `settings.css`, `notifications.css`, `wallet.css`, `my-rewards.css`, `my-rewards-detail.css`, `info-cards-list.css`, `info-cards-detail.css`, `checkout-modal.css`
- **Deleted dead lib**: `categoryIcons.ts`

---

## 5. PWA Pages — 26 Total

| Page | Route | Status |
|---|---|---|
| Splash, Phone, OTP, Profile Setup, Login | `#splash` → `#phone` → `#otp` → `#profile-setup` | ✅ |
| Homepage | `#home` | ✅ |
| Menu | `#menu` | ✅ |
| QR Scanner | `#qr-scanner` | ✅ |
| Cart | `#cart` | ✅ |
| Checkout | `#checkout` | ✅ |
| Orders List + Detail | `#orders`, `#order-detail` | ✅ |
| Rewards | `#rewards` | ✅ |
| Promotions | `#promotions` | ✅ |
| Information | `#information` | ✅ |
| Profile | `#profile` | ✅ |
| Account Details | `#account-details` | ✅ |
| Notifications | `#notifications` | ✅ |
| Help & Support | `#help-support` | ✅ |
| Settings | `#settings` | ✅ |
| Legal | `#legal` | ✅ |
| My Card | `#my-card` | ✅ |
| Referral | `#referral` | ✅ |
| Wallet / Top-Up | `#wallet` | ✅ |
| Transaction History | `#history` | ✅ |
| My Rewards & Vouchers | `#my-rewards` | ✅ |
| Payment Methods | `#payment-methods` | ✅ |

---

## 6. Dine-In Flow — Complete

```
QR scan → Table session → Cart lock → Checkout lock → Order with table_id → Kitchen → Pay at counter → Table release
```

- QR scanner parses table QR → `POST /tables/scan` → validates QR token
- CartPage locks `orderMode` to `dine_in` when session active
- CheckoutPage locks order type, shows "Pay at Counter", hides wallet/COD
- Backend requires `table_id` for `order_type=dine_in`, validates table availability
- `POST /tables/{id}/release` after dine-in completes

---

## 7. Customer-Staff QR Bridge

| Layer | Function |
|---|---|
| PWA My Card | Generates QR with `loka:customer:{id}` payload |
| Admin POS/Wallet Top-Up | Scans QR → `POST /admin/scan/customer` → pulls customer info |
| Backend | `admin_scan_cron.py` parses customer ID, returns name, phone, wallet, loyalty |

---

## 8. Notification System

- **10 auto-seeded templates** at startup, full CRUD via admin
- **Admin broadcast form**: Type dropdown, image URL, template selector
- **PWA**: Filter chips (Orders/Rewards/Wallet/Loyalty/Promos/Info), date groups, mark-all-read
- **Auto-clear**: Configurable retention (default 30 days), admin PWA Settings
- **24h background cleanup** purges old notifications

---

## 9. System Content

- `content_type='system'` cards for T&C, Privacy, About
- Admin Information page has sections editor for structured legal content
- PWA fetches via `GET /content/legal/{terms|privacy|about}`
- Legal page: TOC + collapsible sections + search + API `updated_at`

---

## 10. Admin Frontend — 19 Pages

| Section | Pages |
|---|---|
| Counter Operations | Tables, Order Station, POS Terminal, Wallet Top-Up |
| Menu & Products | Menu Management (HQ only) |
| Store Operations | Dashboard, Orders, Inventory, Staff |
| CRM & Marketing | Customers, Rewards, Vouchers, Promotions, Information, Notifications (with Template Manager), Feedback |
| Analytics | Sales Reports, Marketing ROI |
| System & Config | Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log |

### Role-Based Access

| Role | Access |
|---|---|
| Service Crew (type=3) | 4 counter ops pages |
| Store Manager (type=2) | Counter ops + store ops + CRM + analytics + store settings. No Menu, no System config |
| Admin/HQ (type=1) | Full access — all 19 pages |

---

## 11. Security Posture

**Fixed (Round 1-3 audit)**: `require_permission` crash, XSS via `dangerouslySetInnerHTML`, password min 6→8, wallet top-up confirmation dialog, API timeout (30s), 401 reload loop removal, JWT issuer/audience validation, `BroadcastUpdate` schema (status bypass), `MarketingCampaignUpdate.total_recipients` removed, `OrderCreate.created_at` removed, `last4` validator, CORS wildcard rejection, 16 `alert()` → `console.error()`, `isNaN` guards on all `parseFloat` calls, `ListCard.tsx` innerHTML XSS, OTP code hidden from DEBUG logs, `images.unoptimized` removed.

**Infrastructure**: Redis rate limiting (auto-fallback to in-memory), webhook API key signing, authenticated upload endpoint, `Content-Length` OOM guard, `.env.local` secrets isolation, CI workflow with Postgres service, 17 integration tests.

**Resolved**: ESLint 0 errors / 0 warnings across all changed files. TypeScript 0 errors in both frontends.

**Deferred**: Admin state management refactor (Month 2+).

---

## 12. API — 35/35 Endpoints Verified

Public (13): `/config`, `/content/{stores,information,legal/*,location}`, `/promos/banners`, `/rewards`, `/menu/*`, `/auth/{session,send-otp}`

Auth (22): `/users/*`, `/wallet/*`, `/loyalty/*`, `/orders`, `/notifications/*`, `/referral/*`, `/cart/*`, `/favorites/*`, `/payments/*`, `/feedback`, `/checkout`

---

## 13. Key Architecture Decisions

1. **Codes hidden**: Reward/voucher codes not shown on PWA. Staff scans at counter. Prevents code sharing.
2. **Phone-only auth**: OTP via SMS. No password for customers.
3. **One claim per user**: Backend enforces `max_uses_per_user` on vouchers.
4. **`user_id` + `customer_id`**: Dual FK legacy from user table split. Set to same value.
5. **Store persistence**: `uiStore` uses IndexedDB (`idbStorage`), partializes selected store, order mode, checkout draft.
6. **Auto-migration**: `docker-entrypoint.sh` runs `alembic upgrade head` on deploy.
