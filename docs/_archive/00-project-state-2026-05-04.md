# Loka Espresso — Project State (2026-05-04)

> Phase 3 complete. All PWA pages v2, brand-wide CSS refactored with Turkish premium aesthetic. Admin frontend has notification templates, proper menu placement, role-based access. Dine-in flow fully implemented. Ready for production testing.

## 12. Admin Frontend — Current State

### Role-Based Access (3 tiers)

| Tier | User Type | Access |
|---|---|---|
| **Service Crew** (type_id=3) | Counter staff | Counter Operations only: Tables, Order Station, POS Terminal, Wallet Top-Up |
| **Store Manager** (type_id=2) | Manager, Asst Manager | All counter ops + Store Operations (Dashboard, Orders, Inventory, Staff) + CRM & Marketing (Customers, Rewards, Vouchers, Promos, Info, Notifications, Feedback) + Analytics + Store Settings. No Menu access. No System/Config access. |
| **Admin / HQ** (type_id=1) | HQ Staff, Brand Owner | Full access — all pages including Menu Management, System & Config |

### Sidebar Navigation

| Section | Pages | Icon |
|---|---|---|
| **Counter Operations** | Tables, Order Station, POS Terminal, Wallet Top-Up | `fa-cash-register` |
| **Menu & Products** | Menu Management (HQ only) | `fa-mug-hot` |
| **Store Operations** | Dashboard, Orders, Inventory, Staff | `fa-store` |
| **CRM & Marketing** | Customers, Rewards, Vouchers, Promotions, Information, Notifications, Feedback | `fa-bullhorn` |
| **Analytics** | Sales Reports, Marketing ROI | `fa-chart-bar` |
| **System & Config** | Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log | `fa-cog` |

### Key Changes This Session
- **Menu moved** from Store Management → Menu & Products (separate section)
- **Notification Templates** — new `NotificationTemplateManager` component with full CRUD (create/edit/delete templates)
- **Store Manager** role refined — removed Menu, App Settings, PWA Settings, Loyalty Rules, Audit Log access
- **Section naming** updated to F&B industry standard (Store Operations, Counter Operations, CRM & Marketing)

### Admin Pages — 19 total
| Page | Scope |
|---|---|
| Dashboard | Store Operations |
| Orders | Store Operations |
| Order Station | Counter Operations |
| Menu Management | Menu & Products (HQ only) |
| Inventory | Store Operations |
| Tables | Counter Operations |
| Staff | Store Operations |
| Rewards | CRM & Marketing |
| Vouchers | CRM & Marketing |
| Promotions | CRM & Marketing |
| Information | CRM & Marketing |
| Push Notifications | CRM & Marketing (now with Template Manager) |
| Feedback | CRM & Marketing |
| Customers | CRM & Marketing |
| Sales Reports | Analytics |
| Marketing ROI | Analytics |
| Store Settings | System & Config |
| App Settings | System & Config |
| PWA Settings | System & Config |
| Loyalty Rules | System & Config |
| Audit Log | System & Config |
| Wallet Top-Up | Counter Operations |
| POS Terminal | Counter Operations |

## 1. Brand Design System — Unified ✅

### Color Palette (Turkish Premium)

| Role | Value | Variable |
|---|---|---|
| Primary (Turkish Olive) | `#3B4A1A` | `var(--loka-primary)` |
| Primary Dark | `#263210` | `var(--loka-primary-dark)` |
| Primary Light | `#4E6E20` | `var(--loka-primary-light)` |
| Gold Accent (Turkish Gold) | `#C9A84C` | `var(--loka-accent-gold)` |
| Copper Accent | `#C4893A` | `var(--loka-accent-copper)` |
| Brown (Turkish Coffee) | `#4A2210` | `var(--loka-accent-brown)` |
| Cream | `#F5F0E6` | `var(--loka-cream)` |
| Page Background | `#F2EEE6` | `var(--loka-bg)` |
| Card Background | `#FFFDF8` | `var(--loka-bg-card)` |
| Text Primary | `#1E1B18` | `var(--loka-text-primary)` |
| Text Secondary | `#4A4038` | `var(--loka-text-secondary)` |
| Text Muted | `#8A8078` | `var(--loka-text-muted)` |
| Border | `#D5CCBE` | `var(--loka-border)` |
| Border Light | `#E0D8CB` | `var(--loka-border-light)` |
| Success | `#7AAA7A` | `var(--loka-success)` |
| Danger | `#C75050` | `var(--loka-danger)` |

**Single Source of Truth**: `src/styles/variables.css` + `src/lib/tokens.ts` — both always synchronized.

**Rule**: Every CSS file uses `var(--loka-*)` variables. Never hardcode hex values. Zero legacy hex colors remain in any v2 CSS file.

### Tier Colors (Metallic Gradients)

| Tier | Start | End |
|---|---|---|
| Bronze | `#A0783A` | `#7A5828` |
| Silver | `#B0A9A0` | `#8A8278` |
| Gold | `#D4AF37` | `#B8942A` |
| Platinum | `#8A9AB0` | `#5A6A80` |

### Typography — Unified ✅

| Role | Font | Size | Weight |
|---|---|---|---|
| Page titles | Playfair Display | 20px | 700 |
| Detail titles | Playfair Display | 20px | 700 |
| Section headings | Playfair Display | 16px | 700 |
| Card titles | Inter | 14px | 600 |
| Body text | Inter | 13-14px | 400-500 |
| Labels/captions | Inter | 11-12px | 500-600 |

CSS variables: `--font-sans: 'Inter'`, `--font-display: 'Playfair Display'`.

### Shadows — Golden Tint

All shadows use warm brown tint `rgba(74, 34, 16, ...)` instead of neutral black `rgba(0, 0, 0, ...)`.

---

## 2. Icon System — Unified ✅

**All icons from lucide-react v1.8.0** — 73 imports across 40+ components. Zero FontAwesome.
**No inline SVG elements** — all iconography uses lucide-react components.
**Icon colors** use CSS variables or `LOKA` tokens from `@/lib/tokens`.

| Concept | Icon | Component |
|---|---|---|
| Back/Close | `ArrowLeft`, `X` | 20+ files |
| Rewards | `Gift` | 8 files |
| Vouchers | `Ticket` | 4 files |
| Loyalty/Tier | `Crown`, `Star` | 5 files |
| Location/Address | `MapPin` | 4 files |
| Time/Expiry | `Clock` | 6 files |
| Brand/Menu | `Coffee` | 6 files |
| QR/Scan | `QrCode` | 5 files |
| Share | `Share2` | 4 files |
| Navigate | `ChevronRight`, `ChevronDown`, `ChevronUp`, `ChevronLeft` | 12+ files |
| Wallet | `Wallet`, `CreditCard` | 4 files |
| Settings | `Settings` | 2 files |
| Notifications | `Bell` | 3 files |

---

## 3. CSS Architecture — Unified ✅

### File Structure

```
src/styles/
├── variables.css          # Design tokens (SSOT)
├── utilities.css          # ~400 Tailwind-compatible utilities
├── base.css               # Reset/base
├── components.css         # Shared primitives (btn, chip, badge, etc.)
├── info-cards.css         # Shared sub-page-header + promo + legal blocks
├── profile-subpages.css   # Namespace-prefixed sub-page classes
├── layout-extras.css      # ErrorBoundary, layout utilities
│
├── splash-v2.css          # Splash
├── auth-step-v2.css       # Auth step indicator
├── phone-v2.css           # Phone entry
├── otp-v2.css             # OTP entry
├── profile-setup-v2.css   # Profile setup
├── login-v2.css           # Login modal
├── home-page-v2.css       # Homepage
├── home-bottom-nav-v2.css # Bottom nav
├── qr-scanner-v2.css      # QR scanner
├── menu-page-v2.css       # Menu
├── customize-sheet-v2.css # Customize sheet
├── cart-page-v2.css       # Cart
├── checkout-v2.css        # Checkout
├── store-picker-v2.css    # Store picker
├── saved-addresses-v2.css # Saved addresses
├── orders-list-v2.css     # Orders list
├── order-detail-v2.css    # Order detail
├── rewards-v2.css         # Rewards + rewards detail
├── promotions-v2.css      # Promotions
├── information-v2.css     # Information (products + experiences)
├── profile-v2.css         # Profile
├── account-details-v2.css # Account details
├── notifications-v2.css   # Notifications
├── help-support-v2.css    # Help & support
├── settings-v2.css        # Settings
├── legal-v2.css           # Legal (T&C, Privacy)
├── my-card-v2.css         # My card
├── referral-v2.css        # Referral
├── wallet-v2.css          # Wallet / Top-up
├── history-v2.css         # Transaction history
├── my-rewards-v2.css      # My rewards & vouchers
├── payment-methods-v2.css # Payment methods
├── toast-v2.css           # Toast
│
├── voucher-reveal.css     # Voucher reveal block
├── redemption-code.css    # Redemption code modal
├── terms-list.css         # Terms list
├── my-rewards-detail.css  # Legacy rewards detail (redundant)
├── wallet.css             # Payment methods (wallet page)
```

### Convention

- Every page has a self-contained `*-v2.css` file
- Shared patterns live in `components.css` (buttons, chips, badges) and `info-cards.css` (sub-page-header, promo, legal)
- No page-to-page CSS dependencies
- All CSS files imported in `src/app/globals.css`

### Deleted Legacy Files
`profile.css`, `settings.css`, `notifications.css`, `info-cards-list.css`, `info-cards-detail.css`

---

## 4. Component Patterns — Unified ✅

### Display Cards

| Pattern | Where | Design |
|---|---|---|
| **Gradient stats card** | Profile, Referral, Wallet, History | Green gradient (`#3B4A1A → #4E6E20`) with gold/copper accents, white text, decorative circles |
| **Physical membership card** | My Card | Dark gradient (`#3B4A1A → #2a3a10 → #4A2210`), QR code, tier badge, member info |
| **Tier badge** | Profile, Account Details, My Card | Tier-specific metallic gradient (Bronze/Silver/Gold/Platinum), pill shape |
| **Balance display** | Wallet, Payment Methods | Large 36px value, uppercase label, gradient card |
| **Points display** | Rewards, My Card, Profile | 36px bold white on green gradient, crown icon |
| **Progress bar** | Profile, Rewards, My Rewards, Referral | 6px height, gradient fill (green → copper), warm gray track |

### Tab Bars

| Where | Design |
|---|---|
| Rewards/Promotions | Pill tabs: 40px radius, primary bg on active, 13px font |
| Information (Experiences/Products) | Identical pill tab pattern |
| My Rewards/Vouchers | Identical pill tab pattern |
| History (Loyalty/Wallet) | Identical pill tab pattern |
| Notifications (All/Orders/Rewards/...) | Filter chips: 20px radius, primary bg on active, 12px font |

### Detail Pages

- Hero image with overlay gradient + back button + type tag
- Playfair Display title (20px)
- Meta row with icons
- Description text
- Sticky bottom action button (12px radius)

### Bottom Sheets

- Handle bar (36×4px, rounded)
- Header with close button
- Scrollable body
- Padding: 20px, max-height: 78vh

---

## 5. Shared Components — Unified ✅

| Component | File | Used By |
|---|---|---|
| **DatePicker** (iOS-style) | `ui/DatePicker.tsx` | Account Details (DOB) |
| **ImageCarousel** | Inline in InformationPage | Information detail gallery |
| **BottomSheet** | `ui/BottomSheet.tsx` | Legal (PhoneInput), general sheets |
| **VoucherRevealBlock** | `shared/VoucherRevealBlock.tsx` | Promotions, Checkout |
| **RedemptionCodeModal** | `shared/RedemptionCodeModal.tsx` | Rewards, Promotions |
| **TermsList** | `shared/TermsList.tsx` | Rewards, Promotions |
| **TypePill** | `shared/TypePill.tsx` | Various cards |
| **ErrorBoundary** | `ui/ErrorBoundary.tsx` | App root (catches runtime errors) |
| **ServiceWorkerRegistrar** | `ServiceWorkerRegistrar.tsx` | App layout (SW lifecycle) |

---

## 6. JavaScript/TypeScript — Unified ✅

### Code Quality

- **`any` type usage**: 11 instances (down from 27), all legitimate (third-party libs, dynamic API responses)
- **console.error**: All calls include `[ComponentName]` context prefix
- **ESLint**: `eslint-config-next` with TypeScript rules, 0 errors, 54 warnings
- **dangerouslySetInnerHTML**: 2 instances only (PhoneInput.tsx legal content — accepted risk)
- **`loading="lazy"`**: Added to all below-fold `<img>` elements
- **Error bounds**: `ErrorBoundary` class component wraps app root

### State Management

- **Zustand** stores: `authStore`, `walletStore`, `uiStore`, `cartStore`, `orderStore`
- **IndexedDB persistence**: `uiStore` uses `idbStorage` for selected store, order mode, checkout draft

### API Client

- Axios with auto-refresh token interceptor
- `api.ts` exports all TypeScript interfaces (Store, Order, Reward, Voucher, etc.)
- `recipient_name`/`recipient_phone` present on Order interface

---

## 7. Customer-Staff QR Bridge

| Layer | Function |
|---|---|
| **PWA My Card** | Generates QR code with `loka:customer:{id}` payload |
| **Admin POS Terminal** | Scans QR → `POST /admin/scan/customer` → pulls customer wallet/rewards/vouchers |
| **Admin Wallet Top-Up** | Scans QR → instantly finds customer for in-store top-up |
| **Backend** | `POST /admin/scan/customer` returns full customer info + wallet balance + loyalty points |

---

## 8. Notification System

- **10 auto-seeded templates** for admin broadcast drafting
- **Type filters** on PWA: Orders, Rewards, Wallet, Loyalty, Promos, Info
- **Auto-clear**: Configurable retention (default 30 days) via admin PWA Settings
- **24h background cleanup** task purges old notifications
- **Admin broadcast form**: Type dropdown, image URL, template selector

---

## 9. System Content

- `content_type='system'` cards for T&C, Privacy Policy, About
- Editable via admin Information page with **sections editor** (structured title, body, list items)
- PWA fetches via `GET /content/legal/{terms|privacy|about}`
- Legal page: TOC + collapsible sections + search + API `updated_at`
- Settings page: About section fetched dynamically

---

## 10. PWA Pages — Complete Status (22 pages)

| Page | Route | CSS | Status |
|---|---|---|---|
| Splash | `#splash` | `splash-v2.css` | ✅ |
| Phone Entry | `#phone` | `phone-v2.css` | ✅ |
| OTP | `#otp` | `otp-v2.css` | ✅ |
| Profile Setup | `#profile-setup` | `profile-setup-v2.css` | ✅ |
| Login | `#login` | `login-v2.css` | ✅ |
| Homepage | `#home` | `home-page-v2.css` | ✅ |
| Menu | `#menu` | `menu-page-v2.css` | ✅ |
| QR Scanner | `#qr-scanner` | `qr-scanner-v2.css` | ✅ |
| Cart | `#cart` | `cart-page-v2.css` | ✅ |
| Checkout | `#checkout` | `checkout-v2.css` | ✅ |
| Orders | `#orders` | `orders-list-v2.css` + `order-detail-v2.css` | ✅ |
| Rewards | `#rewards` | `rewards-v2.css` | ✅ |
| Promotions | `#promotions` | `promotions-v2.css` | ✅ |
| Information | `#information` | `information-v2.css` | ✅ |
| Profile | `#profile` | `profile-v2.css` | ✅ |
| Account Details | `#account-details` | `account-details-v2.css` | ✅ |
| Notifications | `#notifications` | `notifications-v2.css` | ✅ |
| Help & Support | `#help-support` | `help-support-v2.css` | ✅ |
| Settings | `#settings` | `settings-v2.css` | ✅ |
| Legal | `#legal` | `legal-v2.css` | ✅ |
| My Card | `#my-card` | `my-card-v2.css` | ✅ |
| Referral | `#referral` | `referral-v2.css` | ✅ |
| Wallet | `#wallet` | `wallet-v2.css` | ✅ |
| History | `#history` | `history-v2.css` | ✅ |
| My Rewards | `#my-rewards` | `my-rewards-v2.css` | ✅ |
| Payment Methods | `#payment-methods` | `payment-methods-v2.css` | ✅ |

---

## 11. Key Architecture Decisions

1. **Codes hidden**: Reward/voucher redemption codes NOT shown on PWA. Staff scans QR at counter.
2. **QR payload**: `loka:customer:{id}` — generated by PWA My Card, parsed by admin scan endpoint.
3. **One claim per user**: Backend enforces `max_uses_per_user` on vouchers. Used vouchers cannot be reclaimed.
4. **Phone-only auth**: OTP via SMS. No password for customers. Admin/staff use password.
5. **`user_id` + `customer_id`**: Both columns exist on models as legacy from user table split. Both set to same value. Future cleanup can drop `user_id`.
6. **Store persistence**: `uiStore` uses IndexedDB (`idbStorage`), partializes `selectedStore`, `orderMode`, `checkoutDraft`.
7. **MaxMind GeoLite2**: Self-hosted IP geolocation (65MB DB in Docker image), `GET /content/location`.
8. **Auto-migration on deploy**: `docker-entrypoint.sh` runs `alembic upgrade head` before FastAPI startup.
