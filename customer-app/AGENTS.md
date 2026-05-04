# Loka Espresso PWA — Agent Documentation

> Phase 3 complete — Turkish coffee premium brand palette applied (2026-05-04)
> `app.loyaltysystem.uk`

---

## 0. Latest Changes (2026-05-04)

### Phase 3 Complete — Turkish Coffee Premium Brand Palette
Unified all 22 PWA pages under a warm, premium Turkish coffee aesthetic. Color-only changes — no layout modifications.

**Tokens updated:** `variables.css` + `tokens.ts` — new palette: `#3B4A1A` primary, `#C9A84C` gold accent, `#C4893A` copper, `#4A2210` brown, `#F2EEE6` warm parchment BG, `#FFFDF8` warm card BG, `#1E1B18` warm text.
**CSS files updated:** All 34 `*-v2.css` files + `globals.css` + `components.css` + `utilities.css` + `base.css` + `wallet.css` + `type-pill.css` + `voucher-reveal.css` + `info-cards.css`. ~400+ hex→variable replacements.
**TSX files updated:** 23 component files — icon `color` props now use `LOKA.*` tokens instead of hardcoded hex.
**Gradients:** All `linear-gradient` values updated to use CSS variables. Toast, wallet, card gradients use warm golden shadows.
**Shadows:** All shadows now use `rgba(74, 34, 16, ...)` warm brown tint instead of `rgba(0, 0, 0, ...)`.
**Tier colors:** Metallic gradients updated — Bronze `#A0783A→#7A5828`, Silver `#B0A9A0→#8A8278`, Gold `#D4AF37→#B8942A`, Platinum `#8A9AB0→#5A6A80`.
**New variables added:** `--loka-accent-gold`, `--loka-primary-light`, `--loka-bg-light`, `--loka-border-warm`, `--font-display`, tier color variables.

### Phase 2 Complete — All Pages v2
All PWA pages now have self-contained `*-v2.css` files. Shared patterns extracted per page group. Key CSS variable fix: `var(--loka-copper)` → `var(--loka-accent-copper)`, `var(--loka-brown)` → `var(--loka-accent-brown)`.

**Promotions v2:** Button style matched rewards (12px radius), share button, `rd-remaining-badge` under "How to Redeem", dynamic voucher count from backend.
**Information v2:** Tab bar (Experiences/Products), matching card style, carousel + share button on detail.
**Profile v2:** Gradient user card, tier badge + progress bar, order thumbnails, colored menu icons. "Notification Preferences" → "Notifications".
**Account Details v2:** Avatar upload, grouped form sections, tier badge, iOS-style DatePicker component. Backend: `date_of_birth` now saved via `PUT /users/me`.
**Notifications v2:** Filter chips, date groups (Today/Yesterday/Earlier), mark-all-read, unread left border, auto-clear retention note. Backend: `notification_retention_days` config + 24h cleanup task.
**Help & Support v2:** FAQ accordion, subject cards, celebratory success. No live chat. Feedback API: fixed PWA `POST /feedback` 404.
**Settings & Legal v2:** About section (dynamic from system content), TOC + collapsible sections + search + API `updated_at`. `settings.css` deleted (duplicate).
**My Card v2:** Physical card design, QR code (`loka:customer:{id}`), tier pills row, share, quick actions.
**Referral v2:** Gradient stats card, code box with confirmation, milestones, invited user avatars.
**Wallet v2:** 4-column preset grid with labels, improved balance card, transaction category icons. Fixed missing `.selected`/`.in`/`.out` CSS.
**My Rewards v2:** Progress bar, expiry countdown, codes HIDDEN (security), bottom sheets without code display.
**History v2:** Monthly summary card, date groups (Today/This Week/Earlier), category icons, Loyalty/Wallet tabs.
**Payment Methods v2:** Wallet card with gradient, brand icons (Visa/MC), default toggle, empty state.

### Backend Additions
- `NotificationTemplate` model + CRUD + auto-seeded 10 templates
- `POST /admin/scan/customer` — staff scans customer QR to get wallet/rewards/voucher info
- `notification_retention_days` config key for admin PWA Settings
- `type` + `image_url` columns on `NotificationBroadcast`
- `customer_id` added to `Feedback` + `Reservation` models
- Schema fix: `promotion` → `event` in `_VALID_CONTENT_TYPES`
- QR scanner updated to handle `loka:customer:` prefix
- Admin Wallet Top-Up now has QR scanner

### Admin Frontend
- Notification type dropdown + image URL + template selector in broadcast form
- `notification_retention_days` field in PWA Settings page

### Key Architecture Decisions
- **Codes hidden**: Reward/voucher redemption codes NOT shown on PWA. Staff scans QR at counter. Prevents code sharing between friends.
- **QR payload format**: `loka:customer:{id}` — used by My Card page and scanned by admin POS/Wallet Top-Up.
- **System content**: `content_type='system'` cards for T&C, Privacy, About. Editable via admin Information page with sections editor.

---

## 1. Design System

### Single Source of Truth

| File | Purpose |
|---|---|
| `src/lib/tokens.ts` | All brand colors, semantic colors, shadows, alpha scales |
| `src/app/globals.css` | Imports all modular CSS files (zero framework dependency) |
| `src/styles/utilities.css` | ~400 pure CSS utility classes (display, flex, padding, colors, etc.) |
| `src/styles/components.css` | Component primitives (btn, chip, badge, guest-banner, etc.) |
| `src/styles/info-cards.css` | Shared sub-page-header + promo + legal blocks |
| `src/styles/sub-components.css` | Small shared sub-components (ListCard, ProfileSetup, etc.) |
| `src/styles/type-pill.css` | TypePill component styles (`.tp-*`) |
| `src/styles/voucher-reveal.css` | VoucherRevealBlock styles (`.vrb-*`) |
| `src/styles/redemption-code.css` | RedemptionCodeModal styles (`.rcm-*`) |
| `src/styles/terms-list.css` | TermsList styles (`.tl-*`) |
| `src/styles/profile-subpages.css` | Namespace-prefixed sub-page classes (`.ad-`, `.np-`, `.hsp-`, etc.) |

### V2 CSS Files (self-contained)
| File | Page |
|---|---|
| `splash-v2.css`, `auth-step-v2.css`, `phone-v2.css`, `otp-v2.css`, `profile-setup-v2.css`, `login-v2.css` | Auth flow |
| `home-page-v2.css`, `home-bottom-nav-v2.css`, `qr-scanner-v2.css` | Home + nav |
| `menu-page-v2.css`, `customize-sheet-v2.css`, `cart-page-v2.css` | Menu + cart |
| `checkout-v2.css`, `store-picker-v2.css`, `saved-addresses-v2.css` | Checkout |
| `orders-list-v2.css`, `order-detail-v2.css` | Orders |
| `rewards-v2.css`, `promotions-v2.css`, `information-v2.css` | Rewards + promos + info |
| `profile-v2.css`, `account-details-v2.css`, `notifications-v2.css`, `help-support-v2.css`, `settings-v2.css`, `legal-v2.css` | Profile sub-pages |
| `my-card-v2.css`, `referral-v2.css`, `wallet-v2.css`, `history-v2.css`, `my-rewards-v2.css`, `payment-methods-v2.css` | More profile sub-pages |
| `toast-v2.css` | Toast notifications |

### Deleted CSS Files (no longer imported)
`profile.css`, `settings.css`, `notifications.css`, `info-cards-list.css`, `info-cards-detail.css`

**Rule:** Never define local `LOKA` objects in components. Import from `src/lib/tokens.ts`.

### Brand Colors (Turkish Coffee Premium)

```
Primary:      #3B4A1A  (Turkish olive)
Primary Dark: #263210
Primary Light:#4E6E20
Gold:         #C9A84C  (primary accent)
Copper:       #C4893A  (secondary accent)
Brown:        #4A2210  (Turkish coffee)
Text Primary: #1E1B18  (warm near-black)
Background:   #F2EEE6  (warm parchment)
Card:         #FFFDF8  (warm white)
```

### CSS Class Reference

#### Typography (`globals.css`)
| Class | Usage |
|---|---|
| `.loka-h1`–`.loka-h6` | Heading sizes |
| `.loka-body`, `.loka-body-sm`, `.loka-caption` | Body text sizes |

#### Layout Components (`globals.css`)
| Class | Usage |
|---|---|
| `.loka-page-header` | Page header bar |
| `.loka-back-btn` | Circular back button |

#### Component Primitives (`components.css`)
| Class | Usage |
|---|---|
| `.chip`, `.chip-primary`, `.chip-secondary`, `.chip-outline`, `.chip-ghost`, `.chip-copper`, `.chip-dark`, `.chip-green`, `.chip-blue` | Status chips |
| `.btn`, `.btn-primary`, `.btn-copper`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-pill` | Button variants |
| `.badge`, `.badge-green`, `.badge-amber`, `.badge-red`, `.badge-dark` | Badge labels |
| `.guest-banner`, `.guest-banner-text`, `.guest-banner-btn` | Guest mode banner |
| `.guest-locked`, `.guest-locked-icon`, `.guest-locked-title`, `.guest-locked-desc`, `.guest-locked-btn` | Guest restricted CTA |

#### Utilities (`utilities.css`)
~400 Tailwind-compatible utility classes for display, flex, grid, padding, margin, width, height, typography, colors, borders, shadows, positioning, transitions, etc. See the file for full reference.

---

## 2. UI Primitives (`src/components/ui/`)

All primitives use pure CSS utility classes from `utilities.css` + design tokens from `variables.css`. No inline styles. **This project does NOT use Tailwind CSS.**

| Component | File | Variants / Props |
|---|---|---|
| `Button` | `Button.tsx` | primary/secondary/outline/ghost × sm/md/lg |
| `IconButton` | `IconButton.tsx` | default/primary/ghost/subtle × sm/md/lg |
| `FAB` | `FAB.tsx` | Floating action button (fixed bottom-right) |
| `PrimaryActionButton` | `shared/PrimaryActionButton.tsx` | Full-width pill with loading state |
| `Input` | `Input.tsx` | Text input with label, error, icons |
| `Textarea` | `Input.tsx` | Multi-line input |
| `SearchBar` | `SearchBar.tsx` | Search with clear button, focus ring |
| `Select` | `Select.tsx` | Custom dropdown with checkmark |
| `DatePicker` | `DatePicker.tsx` | Month calendar with min/max dates |
| `Checkbox` | `Checkbox.tsx` | Check toggle |
| `Radio` | `Radio.tsx` | Single-select radio |
| `Toggle` | `Toggle.tsx` | iOS-style switch with spring animation |
| `Modal` | `Modal.tsx` | Bottom sheet + center variants |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive + standard confirmation |
| `InfoPopup` | `InfoPopup.tsx` | Single-action info alert |
| `ActionSheet` | `ActionSheet.tsx` | Bottom sheet list of choices |
| `Toast` | `Toast.tsx` | Success/error/info toast (used by uiStore) |
| `Badge` | `Badge.tsx` | 7 color variants |
| `StatusChip` | `StatusChip.tsx` | 10 status variants with optional dot |
| `StorePill` | `StorePill.tsx` | Primary-green store pill with MapPin |
| `SurfaceCard` | `SurfaceCard.tsx` | default/elevated/pressed/gradient |
| `SectionHeader` | `SectionHeader.tsx` | Title + optional "See All" action |
| `Avatar` | `Avatar.tsx` | Image or initials, 4 sizes, gradient fallback |
| `Divider` | `Divider.tsx` | full/inset/middle |
| `Carousel` | `Carousel.tsx` | Swipeable with dots, arrows, autoplay |
| `Skeleton` | `Skeleton.tsx` | Generic + card + product skeletons |
| `PageHeader` | `shared/PageHeader.tsx` | Back button + title |

---

## 3. Backend Changes (Information Cards)

### Database

**Table:** `information_cards`

| Column | Type | Notes |
|---|---|---|
| `slug` | `VARCHAR(255)`, nullable, indexed | Human-readable URL identifier |
| `gallery_urls` | `JSONB`, nullable | Array of additional image URLs |

### Migrations

- `04aa2eaf646d` — Add `slug` to information_cards
- `41c93302d76f` — Add `gallery_urls` (JSONB) to information_cards

### API Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /content/information` | Public | List active cards |
| `GET /content/information/{slug}` | Public | Fetch single card by slug (QR deep-link) |
| `POST /upload/information-image` | Admin | Upload image to `uploads/information/` |
| `POST /upload/marketing-image` | Admin | Upload image to `uploads/marketing/` |
| `CRUD /admin/content/cards` | Admin | Full card management with `slug` + `gallery_urls` |

### Slug Generation

- Auto-generated from title: `"The Art of Baklava"` → `the-art-of-baklava`
- Admin can override with custom slug (e.g., `baklava-art`)
- Stored in DB, returned in all API responses

### Gallery Images

- Cover image: `image_url` (single, shown in list + article header)
- Gallery: `gallery_urls` (array, shown as swipeable carousel in article detail)
- Both stored as relative paths: `/uploads/information/filename.jpg`
- Resolved to full URL via `resolveAssetUrl()` in frontend

---

## 4. QR Code Deep-Linking

### URL Format

```
https://app.loyaltysystem.uk/?slug={slug}#information
```

Example:
```
https://app.loyaltysystem.uk/?slug=history-of-pide#information
```

### Flow

1. Customer scans QR → opens URL
2. `AppShell` parses `?slug=` on mount, stores in ref
3. Query params cleaned from URL immediately
4. Customer goes through auth flow (splash → phone → OTP → profile)
5. After `handleAuthDone()`, app navigates to `#information` with `selectedInfoSlug`
6. `InformationPage` fetches article by slug via `/content/information/{slug}`
7. Article opens automatically

### Customer Journey

```
Scan QR (curiosity) → Splash screen → Login → Auto-open article → Registered user
```

---

## 5. Image Handling

### Upload Flow

| Source | Endpoint | Destination |
|---|---|---|
| Admin → Info Card Cover | `POST /upload/information-image` | `uploads/information/` |
| Admin → Info Card Gallery | `POST /upload/information-image` | `uploads/information/` |
| Admin → Marketing | `POST /upload/marketing-image` | `uploads/marketing/` |

**Important:** Docker mounts `./uploads:/app/uploads` from project root (`/root/fnb-super-app/uploads/`), NOT `backend/uploads/`.

### PWA Display

- **List view:** `image_url` shown as 88×88 thumbnail
- **Article detail:**
  - Single image → static cover (aspect-video)
  - Multiple images (`gallery_urls`) → `ImageCarousel` component with swipe + dots

### ImageCarousel Component

- Swipe left/right to navigate
- Dot pagination at bottom
- Arrow indicators (subtle)
- Touch gesture support

---

## 6. File Structure Conventions

```
customer-app/src/
├── app/
│   ├── globals.css          # Design system CSS (pure CSS, no framework)
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # AppShell entry
├── components/
│   ├── ui/                  # 21 reusable primitives
│   ├── shared/              # PageHeader, PrimaryActionButton, etc.
│   ├── menu/                # MenuPage, ItemCard, etc.
│   ├── checkout/            # Checkout flow components
│   ├── auth/                # Auth flow components
│   └── profile/             # Profile sub-pages
├── stores/                  # Zustand stores (auth, cart, ui, wallet, config)
├── hooks/                   # Custom React hooks
├── lib/
│   ├── api.ts               # API client + types
│   ├── tokens.ts            # Design tokens (SSOT)
│   └── ...                  # Utilities
```

---

## 7. Rules for Next Agent

1. **No Tailwind** — Zero Tailwind in this project. Use pure CSS utility classes from `utilities.css` (Tailwind-compatible naming). No `tailwind.config`, no `@tailwind` directives.
2. **No inline styles for layout** — Use CSS utility classes from `utilities.css` or dedicated CSS modules. Inline styles only for genuinely dynamic values: carousel `transform`, progress-bar `width`, bottom-sheet `maxHeight`, `aspectRatio`, and dynamic `backgroundImage`.
3. **No local LOKA objects** — Always import from `@/lib/tokens`. Do NOT redefine `LOKA` in checkout or other components.
4. **Use primitives** — Don't reinvent `SurfaceCard`, `StatusChip`, etc.
5. **Images go to `uploads/information/`** for info cards, `uploads/marketing/` for promos.
6. **Add `slug` when creating information cards** — Auto-generated but overridable.
7. **Test Cloudflare cache** — New images may need cache-busting (rename files) if they 404 initially.
