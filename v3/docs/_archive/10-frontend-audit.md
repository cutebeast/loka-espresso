# FNB Super-App — Frontend Architecture Audit & Improvement Recommendations

> Created: 2026-04-22 | Updated: 2026-04-22 | Status: Active — P0/P1 items in progress | Scope: `frontend/` (admin) + `customer-app/` (PWA)

**Legend:** ✅ = Resolved in Session 14 | 🔲 = Still open | 🔄 = Partially resolved

---

## Executive Summary

Both frontends are **functionally feature-complete** against the current backend contract but share **architectural debt** from being built as SPAs inside Next.js rather than using Next.js conventions. The most impactful improvements fall into three buckets:

1. **Security & Reliability** (high risk, medium effort)
2. **Architecture & Maintainability** (medium risk, high effort)
3. **User Experience & Performance** (medium risk, medium effort)

This document lists **specific, actionable recommendations** before any implementation begins.

---

## Part A: Admin Frontend (`frontend/`) — Gaps & Recommendations

### A1. CRITICAL — Security

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| A1.1 | **JWT in localStorage** ✅ | Tokens stored in `localStorage` (`fnb_token`, `fnb_refresh_token`) | **RESOLVED:** Dead auth files removed (`lib/api.ts`, `lib/auth.tsx`, `lib/admin-context.tsx`, `lib/store.tsx`). Admin now uses httpOnly cookies (`credentials: 'include'`). |
| A1.2 | **Missing CSP on customer-app** ✅ | Admin has CSP; PWA (`customer-app/next.config.ts`) has **no CSP header** | **RESOLVED:** CSP headers added to both `customer-app/next.config.ts` and `frontend/next.config.ts`. |
| A1.3 | **No input sanitization** | Admin forms send raw text to API | Add client-side sanitization (DOMPurify or similar) for rich text fields before submit. |

### A2. HIGH — Architecture & Routing

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| A2.1 | **Monolithic root page** 🔄 | `src/app/page.tsx` was **836 lines**, holds state for ALL pages | **PARTIAL:** Extracted `ChangePasswordModal` and `CustomizationManager`. Page now 708 lines. Full file-based routing still pending. |
| A2.2 | **Client-side routing only** 🔄 | URL never changes when switching pages. Refresh always returns to dashboard. | **PARTIAL:** Hash-based routing added to both apps (`#orders`, `#menu`, etc.). Browser back/forward works. Deep linking works. Full file-based routing still pending. |
| A2.3 | **Mixed API patterns** | Some pages self-fetch (Rewards, Vouchers), others rely on parent `page.tsx` | Standardize: every page fetches its own data in a `useEffect` or (better) use Next.js data fetching patterns. Remove fetch logic from `page.tsx`. |
| A2.4 | **No centralized API client** | `apiFetch` in `merchant-api.tsx` is a thin wrapper around `fetch` | Upgrade to a typed axios instance (like customer-app) or expand `apiFetch` to:<br>- Auto-parse JSON<br>- Return typed errors<br>- Handle common status codes uniformly |

### A3. HIGH — Testing & Quality

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| A3.1 | **Zero test coverage** | No tests in `frontend/` | Add minimum test layer:<br>- Component tests for `DataTable`, `Modal`, `LoginScreen`<br>- API mock tests for `merchant-api.tsx`<br>- Use Vitest + React Testing Library |
| A3.2 | **No TypeScript strictness** | `tsconfig.json` not inspected but likely missing strict flags | Enable `strict: true`, `noImplicitAny`, `strictNullChecks` in `tsconfig.json`. |

### A4. MEDIUM — UX & Performance

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| A4.1 | **Inline styles everywhere** | Massive `style={{...}}` objects mixed with CSS classes | Migrate to CSS classes or CSS Modules. Inline styles are hard to maintain and override. |
| A4.2 | **No loading skeletons** | Global `loading` spinner only; no per-page skeletons | Add skeleton loaders for Dashboard KPI cards, table rows, and charts. |
| A4.3 | **Image optimization disabled** | `images.unoptimized: true` in `next.config.ts` | Enable Next.js Image Optimization. Use `<Image>` component with proper `sizes` and lazy loading. |
| A4.4 | **Sidebar state not persisted** | Collapse/expand resets on refresh | Persist sidebar state to `localStorage`. |
| A4.5 | **Mobile sidebar UX** | Mobile hamburger exists but sidebar overlay lacks backdrop click-to-close | Add backdrop overlay and swipe-to-close gesture. |

### A5. LOW — Missing Features

| # | Issue | Recommendation |
|---|-------|----------------|
| A5.1 | **No bulk actions** | Add bulk select + actions to Orders, Customers, and Inventory tables |
| A5.2 | **No export functionality** | Add CSV/Excel export to Reports and Orders pages |
| A5.3 | **No keyboard shortcuts** | Add common shortcuts (e.g., `?` for help, `/` for search, `Esc` to close modals) |
| A5.4 | **No print styles** | Kitchen display and receipts should have `@media print` optimized layouts |

---

## Part B: Customer PWA (`customer-app/`) — Gaps & Recommendations

### B1. CRITICAL — Security & Auth

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B1.1 | **JWT in localStorage** 🔲 | `loka-auth` persisted to localStorage via Zustand persist | Move to **httpOnly cookies**. PWA can still use cookies; `axios` sends them automatically. Customer PWA auth still uses zustand persist (IndexedDB). |
| B1.2 | **Token refresh reload loop risk** | `_refreshFailed` flag is module-level but never resets without reload | Reset `_refreshFailed` after a timeout (e.g., 30s) or on successful non-auth request. |
| B1.3 | **No input sanitization** | Feedback form, order notes, address labels send raw text | Add DOMPurify sanitization for any user-generated content displayed back to users. |

### B2. CRITICAL — Offline & PWA

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B2.1 | **No offline cart** ✅ | Cart lives in Zustand + localStorage; lost if user closes app while offline | **RESOLVED:** Cart uses zustand persist with `loka-cart` key. Data survives app closure. |
| B2.2 | **No background sync** | Service worker has no `sync` event registration | Register `sync` events in SW:<br>- `sync('cart-sync')` on cart changes<br>- `sync('order-submit')` for offline orders |
| B2.3 | **No offline indicator** ✅ | No UI banner when network drops | **RESOLVED:** `OfflineBanner` component added to AppShell. Shows green banner when offline. |
| B2.4 | **API cache missing** | SW does `network-only` for `/api/` | Implement **stale-while-revalidate** for:<br>- Menu data (cache 5 min)<br>- Store list (cache 1 hour)<br>- User profile (cache until logout) |
| B2.5 | **Basic offline.html** | Just a retry button | Show cached app shell with read-only data (menu, past orders) when offline. |

### B3. HIGH — Architecture & Routing

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B3.1 | **Monolithic AppShell** ✅ | `AppShell.tsx` was **914 lines** with all page routing logic | **RESOLVED:** Decomposed into `AuthFlow.tsx` (220 lines), `DashboardHeader.tsx` (130 lines), `BottomNav.tsx` (120 lines), `StorePickerModal.tsx` (200 lines). AppShell now 395 lines. |
| B3.2 | **No URL-based routing** ✅ | Refresh always returns to home. No shareable URLs. | **RESOLVED:** Hash-based routing added. `window.location.hash` syncs with `page` state. Back/forward navigation works. Deep links like `https://app.loyaltysystem.uk/#orders` work. |
| B3.3 | **Monolithic `uiStore`** | Holds routing, stores, categories, menu items, toast, search, loading | Split into domain stores:<br>- `routingStore`<br>- `storeFinderStore`<br>- `menuStore`<br>- `toastStore` |
| B3.4 | **Tight store coupling** | `authStore.logout()` directly calls methods on 4 other stores | Use an event bus or centralized logout action that individual stores subscribe to. |
| B3.5 | **Hardcoded domains** | `https://admin.loyaltysystem.uk` hardcoded in `tokens.ts`, `api.ts` | Use `process.env.NEXT_PUBLIC_API_BASE` everywhere. Fail build if missing. |

### B4. HIGH — Performance

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B4.1 | **No image optimization** | `images.unoptimized: true`, raw `<img>` tags | Enable Next.js `<Image>` with `loading="lazy"`, `placeholder="blur"`, and WebP conversion. |
| B4.2 | **No virtualized lists** | Long menus, orders, transactions render all items | Use `react-window` or `react-virtualized` for lists > 20 items. |
| B4.3 | **N+1 API calls** | `PromotionsPage` calls `/promos/banners/{id}/status` per banner | Add batch endpoint `POST /promos/banners/status` or include status in banner list response. |
| B4.4 | **Aggressive polling** ✅ | Orders 30s, version 60s, notifications 5min | **RESOLVED:** Polling intervals reduced — orders 30s→60s, version 30s→5min, notifications 30s→10min. |
| B4.5 | **Framer Motion overhead** | Every button has `whileTap`. Causes jank on low-end devices. | Remove `whileTap` from non-interactive elements. Use CSS `:active` transforms where possible. |

### B5. MEDIUM — Accessibility

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B5.1 | **No focus trapping in modals** ✅ | `Modal`, `ItemCustomizeSheet`, `RedemptionCodeModal` don't trap focus | **RESOLVED:** Modal focus trapping + Escape key handling added. |
| B5.2 | **No focus management on route change** | Internal page transitions don't move focus | On page change, programmatically focus the `<main>` element or page heading. |
| B5.3 | **Clickable divs** | Many `div` elements with `onClick` instead of `<button>` | Audit and replace with semantic `<button>` elements. |
| B5.4 | **No `prefers-reduced-motion`** ✅ | Framer Motion runs regardless of user preference | **RESOLVED:** `useReducedMotion` hook applied to all framer-motion animations. |
| B5.5 | **Missing modal roles** | Modal component lacks `role="dialog"`, `aria-modal="true"` | Add ARIA attributes. Use `aria-labelledby` pointing to modal title. |

### B6. MEDIUM — Mobile UX

| # | Issue | Current State | Recommendation |
|---|-------|---------------|----------------|
| B6.1 | **Landscape blocked** | `@media (orientation: landscape) and (max-height: 500px)` hides app | Remove landscape block. Instead, adapt layout for landscape (2-column menu, side-by-side checkout). |
| B6.2 | **No pull-to-refresh** | Standard mobile pattern missing | Implement pull-to-refresh for lists (orders, transactions, menu). |
| B6.3 | **Keyboard handling** | Bottom sheets don't adjust for virtual keyboard | Listen to `visualViewport` resize events and adjust sheet height. |
| B6.4 | **No safe-area-inset on modals** | Bottom sheets may be hidden by iOS home indicator | Add `padding-bottom: env(safe-area-inset-bottom)` to all bottom-fixed UI. |
| B6.5 | **Phone frame on desktop** | `max-width: 430px` with phone chrome is not a responsive web app | On desktop/tablet, show a true responsive layout (not a phone mockup) or at least center the frame with better chrome. |

### B7. LOW — Missing Features

| # | Feature | Recommendation |
|---|---------|----------------|
| B7.1 | **PWA install prompt** ✅ | Add custom "Add to Home Screen" banner using `beforeinstallprompt` event | **RESOLVED:** `useA2HS` hook captures `beforeinstallprompt`. Dismissible green install banner in AppShell. |
| B7.2 | **Push permission UI** | Add a settings toggle that calls `Notification.requestPermission()` |
| B7.3 | **Dark mode** | Add `prefers-color-scheme` listener and dark CSS variables |
| B7.4 | **Favorites / Recently Ordered** | Add "Add to Favorites" on menu items; show "Order Again" on home |
| B7.5 | **Dietary filters** | Add vegetarian, vegan, gluten-free, halal filters to menu |
| B7.6 | **Store open/closed status** | Parse `opening_hours` JSON and show "Open now / Closes at X" |
| B7.7 | **Social sharing** | Add Web Share API to promotions, menu items, and referral code |
| B7.8 | **Guest checkout** | Allow browsing menu without login; prompt at checkout |

---

## Part C: Cross-Cutting Recommendations (Both Apps)

### C1. Authentication Architecture

**Current:** Both apps store JWT access + refresh tokens in `localStorage`.

**Recommended:**
1. Backend sets `access_token` as **httpOnly cookie** (short-lived, 15-30 min)
2. Backend sets `refresh_token` as **httpOnly cookie** (long-lived, 7-30 days)
3. Frontend removes all `localStorage` token logic
4. Axios/fetch automatically include cookies; no manual `Authorization` header needed
5. On 401, hit `/auth/refresh` (cookie-based) → backend rotates both cookies

**Benefits:** XSS cannot steal tokens. CSRF is mitigated by `SameSite=Strict` + CORS.

### C2. Routing Architecture

**Current:** Both apps use a single `page.tsx` with internal `useState` for routing.

**Recommended:**
1. Use Next.js App Router file-based routing properly
2. Admin: `/admin/dashboard`, `/admin/orders`, `/admin/customers/[id]`, etc.
3. PWA: `/menu`, `/cart`, `/orders`, `/orders/[id]`, `/rewards`, etc.
4. Use `next/navigation` for programmatic navigation
5. Preserve scroll position on back navigation

**Benefits:** Deep linking, SEO, shareable URLs, proper browser history, Next.js optimizations.

### C3. State Management Standardization

**Current:** Admin uses raw `useState` (785 lines of state). PWA uses Zustand but monolithic stores.

**Recommended:**
1. **Admin:** Migrate page-level state into page components. Keep only auth + sidebar state in shared context.
2. **PWA:** Split `uiStore` into domain stores. Use Zustand `subscribe` pattern for cross-store communication (e.g., logout).
3. Both: Use React Query / TanStack Query for server state (caching, deduping, background refetch).

### C4. API Contract Alignment

**Current:** Admin uses `merchant-api.tsx` (fetch wrapper). PWA uses `axios` instance. Types are duplicated.

**Recommended:**
1. Generate TypeScript types from backend OpenAPI schema (FastAPI native)
2. Share generated API client between both apps (monorepo or npm workspace)
3. Use `axios` consistently (better interceptors, timeout handling, request cancellation)

### C5. Styling Standardization

**Current:** Both apps use CSS classes with some inline `style` objects for dynamic values.

**Recommended:**
1. Remove all inline `style` objects where static CSS classes can replace them
2. Use CSS classes and CSS custom properties for theming
3. For dynamic values, use CSS variables
4. For theme values, maintain tokens in `tokens.ts` and mirror as CSS custom properties

### C6. Testing Strategy

**Current:** Zero tests in both frontends.

**Recommended minimum:**
1. **Unit tests:** Utility functions (`formatRM`, `normalizePhone`, `cacheBust`)
2. **Component tests:** `Button`, `Modal`, `DataTable`, `LoginScreen`, `OTPInput`
3. **Integration tests:** Login flow, add-to-cart flow, checkout flow
4. **E2E tests:** One critical path per app (admin: login → view orders; PWA: login → place order)

---

## Part D: Implementation Priority Matrix

### Priority 0 — Critical (Do First)

| # | Task | Effort | Apps | Why |
|---|------|--------|------|-----|
| P0.1 | Move JWT to httpOnly cookies | Medium | Both | XSS risk is the highest security concern |
| P0.2 | Add offline cart (IndexedDB) | Medium | PWA | Core PWA promise broken without this |
| P0.3 | Add offline network indicator | Low | PWA | Basic UX expectation |
| P0.4 | Add CSP to customer-app | Low | PWA | Security parity with admin |

### Priority 1 — High (Do Next)

| # | Task | Effort | Apps | Why |
|---|------|--------|------|-----|
| P1.1 | Refactor monolithic root components | High | Both | Maintainability, reduces bugs |
| P1.2 | Implement file-based routing | High | Both | Deep linking, SEO, browser expectations |
| P1.3 | Add service worker background sync | Medium | PWA | Completes offline story |
| P1.4 | Add focus trapping to modals | Low | PWA | Accessibility requirement |
| P1.5 | Enable image optimization | Low | Both | Performance win |
| P1.6 | Add `prefers-reduced-motion` | Low | PWA | Accessibility |

### Priority 2 — Medium (Do After)

| # | Task | Effort | Apps | Why |
|---|------|--------|------|-----|
| P2.1 | Split monolithic stores | Medium | Both | State management hygiene |
| P2.2 | Add stale-while-revalidate API caching | Medium | PWA | Better offline experience |
| P2.3 | Add virtualized lists | Medium | Both | Performance at scale |
| P2.4 | Remove inline styles → CSS classes | Medium | Both | Consistency, maintainability |
| P2.5 | Add pull-to-refresh | Low | PWA | Mobile UX standard |
| P2.6 | Fix landscape blocking | Low | PWA | Tablet users |
| P2.7 | Add keyboard handling for sheets | Low | PWA | Mobile UX |
| P2.8 | Reduce polling + visibility-aware | Low | PWA | Battery life |

### Priority 3 — Low (Nice to Have)

| # | Task | Effort | Apps | Why |
|---|------|--------|------|-----|
| P3.1 | PWA install prompt | Low | PWA | Engagement |
| P3.2 | Dark mode | Medium | Both | Modern expectation |
| P3.3 | Favorites / Recently Ordered | Medium | PWA | Engagement, retention |
| P3.4 | Dietary filters | Low | PWA | UX enhancement |
| P3.5 | Store open/closed status | Low | PWA | Accuracy |
| P3.6 | Social sharing | Low | PWA | Viral growth |
| P3.7 | Guest checkout | Medium | PWA | Conversion |
| P3.8 | Bulk actions / Export (admin) | Medium | Admin | Operational efficiency |
| P3.9 | Keyboard shortcuts (admin) | Low | Admin | Power user UX |
| P3.10 | Print styles for kitchen | Low | Admin | Operational need |

---

## Part E: Quick Wins (Can Be Done Immediately)

These are low-risk, low-effort improvements that can be implemented without architectural changes:

1. **Add CSP to `customer-app/next.config.ts`** — copy from admin
2. **Add offline indicator banner** — simple `navigator.onLine` listener
3. **Fix `_refreshFailed` reset** — add timeout or reset on success
4. **Add `loading="lazy"` to all `<img>` tags** — immediate performance gain
5. **Add `role="dialog"` + `aria-modal="true"` to Modal component** — accessibility
6. **Remove landscape block media query** — one-line CSS change
7. **Add `env(safe-area-inset-bottom)` to bottom nav and sheets** — iOS fix
8. **Pause polling when `document.hidden`** — battery improvement
9. **Extract `formatPrice` / `formatRM` to shared utils** — reduce duplication
10. **Add empty state for failed menu load** — distinguish error from empty

---

## Conclusion

The FNB Super-App frontends are **feature-rich but architecturally immature**. The biggest risks are:

1. **Security:** JWT in localStorage is the most urgent fix
2. **Maintainability:** Monolithic components will slow future development
3. **PWA credibility:** Without offline cart and background sync, it's not a true PWA

My recommendation is to tackle **P0 items first** (security + offline basics), then **P1 architectural refactors** (routing, component splitting), then layer in **P2-P3 enhancements**.

All of the above can be implemented incrementally without breaking existing functionality, provided we maintain the existing API contract.
