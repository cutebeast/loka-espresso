# FNB Super App — Comprehensive Production Audit Report
**Date:** 2026-05-04  
**Auditor:** Kimi Code CLI  
**Scope:** Backend API, Admin Frontend, Customer PWA, Infrastructure, Documentation  
**Status:** Functional but NOT production-ready without addressing Critical/High findings

---

## Executive Summary

The FNB Super App is a full-featured food & beverage loyalty and ordering platform built on a solid architectural foundation (FastAPI + SQLAlchemy 2 + Next.js 16 + PostgreSQL 16). The codebase is well-organized, extensively documented, and functionally complete for its target use case (Loka Espresso).

**However, a number of critical security vulnerabilities, performance anti-patterns, and infrastructure gaps were identified that must be resolved before this system can safely handle real customer data and payment transactions in production.**

### Grade Summary

| System Area | Grade | Verdict |
|-------------|-------|---------|
| Backend API | C+ | Solid foundation; critical bugs and mass-assignment risks present |
| Admin Frontend | C+ | Well-organized; severe prop drilling, a11y gaps, security oversights |
| Customer PWA | B- | Feature-rich; XSS vector, unoptimized images, incomplete PWA features |
| Infrastructure | C | Docker setup works; in-memory rate limiting, upload auth missing |
| Test Coverage | F | Only 1 health test file exists; zero frontend/backend integration tests |
| Documentation | A | Excellent; comprehensive, well-maintained, cross-referenced |

**Overall System Grade: C+ — Functional prototype/ MVP stage. Requires hardening for production.**

---

## 🔴 CRITICAL ISSUES (Fix Before ANY Production Use)

### C1. Backend: `require_permission` Dependency Factory Crashes at Runtime
- **File:** `backend/app/core/security.py` (lines 247, 268)
- **Issue:** The factory function returns `role_checker`, but the nested async function is named `checker`. This causes `NameError` at runtime. It is currently unused in the codebase (latent bug), but any future adoption will break the endpoint entirely.
- **Fix:** Change `return role_checker` → `return checker`

### C2. Customer PWA: XSS via `dangerouslySetInnerHTML` on Unsanitized API Content
- **File:** `customer-app/src/components/auth/PhoneInput.tsx` (lines 329, 334)
- **Issue:** Renders `section.body` and list `item` strings directly from API via `dangerouslySetInnerHTML` without sanitization. If the backend is compromised or ever allows HTML in legal content, this is a direct XSS vector.
- **Fix:** Use DOMPurify before rendering, or switch to a Markdown renderer.

### C3. Backend: Mass-Assignment Vulnerability in ~13 Admin Endpoints
- **Files:** `admin_staff.py`, `admin_inventory.py`, `admin_content.py`, `admin_broadcasts.py`, `admin_customizations.py`, `admin_marketing.py`, `admin_stores.py`, `admin_banners.py`, `admin_vouchers.py`, `admin_menu.py`, `admin_rewards.py`, `admin_loyalty_tiers.py`, `admin_customer_actions.py`
- **Issue:** These endpoints use `setattr(obj, key, value)` loops over `model_dump(exclude_unset=True)` without per-field allowlists. If a schema ever accidentally includes a sensitive field (e.g., `password_hash`, `is_superuser`, `role_id`), it becomes an immediate mass-assignment vulnerability.
- **Fix:** Replace `setattr` loops with explicit field allowlists or Pydantic schema validation that restricts updateable fields.

### C4. Backend: Uploads Served Without Authentication
- **File:** `backend/app/main.py` (line 184)
- **Issue:** `app.mount("/uploads", StaticFiles(directory=upload_dir), ...)` serves all uploaded files publicly. Any user who knows or guesses the UUID filename can access any uploaded image/document without authentication. This includes potential PII (avatars, receipts, marketing materials).
- **Fix:** Serve uploads through an authenticated proxy endpoint (`GET /uploads/{path}` with auth dependency) instead of raw `StaticFiles`.

### C5. Admin Frontend: Staff Passwords Rendered in Plain Text in UI
- **File:** `frontend/src/components/pages/system/StaffPage.tsx`
- **Issue:** New staff passwords and reset passwords are rendered in plain text inside a green notice box for ~2 minutes. This is a severe shoulder-surfing and screen-sharing risk.
- **Fix:** Never render passwords in the DOM. Send credentials via email/SMS only, or provide a one-time copy-to-clipboard button that immediately clears the value.

### C6. Backend & PWA: OTP Bypass Configuration Risk
- **Files:** `backend/.env` (line 22: `OTP_BYPASS_ALLOWED=true`), `customer-app/src/components/auth/LoginModal.tsx` (line 103)
- **Issue:** 
  - Backend `.env` has `OTP_BYPASS_ALLOWED=true` 
  - PWA `LoginModal.tsx` checks `process.env.NEXT_PUBLIC_OTP_BYPASS === 'true'` **without** the `NODE_ENV !== 'production'` guard that exists in `AuthFlow.tsx`
- **Fix:** Ensure `OTP_BYPASS_ALLOWED=false` and `NEXT_PUBLIC_OTP_BYPASS=false` in all production builds. Add the `NODE_ENV` guard to `LoginModal.tsx`.

---

## 🟠 HIGH SEVERITY ISSUES (Fix Before Production Launch)

### H1. Backend: In-Memory Rate Limiting & Idempotency Are Not Distributed-Safe
- **Files:** `backend/app/core/middleware.py` (custom `RateLimitByEndpointMiddleware`, `IdempotencyMiddleware`)
- **Issue:** Both use Python dictionaries stored in process memory. In a multi-worker Docker deployment or Kubernetes, these are per-process and can be trivially bypassed by distributing requests across instances.
- **Fix:** Implement Redis-backed rate limiting and idempotency storage.

### H2. Both Frontends: Images Completely Unoptimized
- **Files:** `frontend/next.config.ts`, `customer-app/next.config.ts`
- **Issue:** Both have `images: { unoptimized: true }`, which disables Next.js image optimization. On mobile PWA, this causes excessive bandwidth usage, slower LCP, and no WebP/AVIF conversion.
- **Fix:** Remove `unoptimized: true`, use `<Image>` with proper sizing, or configure a CDN loader.

### H3. Backend: No Server-Side XSS Sanitization on User-Generated Content
- **File:** `backend/app/core/sanitization.py` (exists but unused)
- **Issue:** `bleach`-based sanitization utilities exist but are **not actively invoked** in endpoint handlers. Fields like `notes`, `staff_notes`, `comment`, `feedback` text, and `body` are stored raw in the database.
- **Fix:** Apply `sanitize_html()` to all user-generated text fields before database persistence.

### H4. Backend: Raw SQL f-Strings in Admin Reset Endpoints
- **Files:** `backend/app/api/v1/endpoints/admin/admin_system.py`, `admin_customer_actions.py`
- **Issue:** Uses Python f-strings with `text(f"DELETE FROM {table_name}")`. While values are validated against hardcoded allowlists, this is brittle. A future refactor that bypasses the allowlist creates an immediate SQL injection vector.
- **Fix:** Use SQLAlchemy `delete()` with table objects, or keep allowlists but add explicit typing and defensive checks.

### H5. Backend: Order History Backdating Vulnerability
- **File:** `backend/app/api/v1/endpoints/common/order_status.py` (lines 93-94)
- **Issue:** A staff member can provide `completed_at` in the request to backdate an order status change. No validation ensures this date is reasonable (not in the future or far in the past).
- **Fix:** Validate `completed_at` is within a reasonable window (e.g., last 24 hours) of the current time.

### H6. Backend: Weak Password Policy
- **File:** `backend/app/api/v1/endpoints/common/auth.py` (line 484)
- **Issue:** Minimum password length is 6 characters. OWASP recommends 8+.
- **Fix:** Enforce minimum 8 characters, add complexity requirements, and consider integrating `zxcvbn` for strength checking.

### H7. Backend: Missing Issuer/Audience Verification in Token Operations
- **Files:** `backend/app/core/security.py` (token blacklisting, session checks)
- **Issue:** `_blacklist_token()` and `/auth/session` decode JWTs without verifying `iss` or `aud`. If the same secret is reused across services, tokens from other services could be accepted.
- **Fix:** Add `issuer` and `audience` verification to all decode operations.

### H8. Admin Frontend: Massive `useEffect` Causes Redundant API Calls
- **File:** `frontend/src/app/page.tsx` (line ~241)
- **Issue:** A single `useEffect` with 12+ dependencies triggers **all** fetch callbacks whenever any dependency changes. Because `useCallback` dependencies themselves change frequently, this causes redundant API requests and race conditions.
- **Fix:** Split into separate `useEffect` hooks per data source, or adopt TanStack Query / SWR for server state management.

### H9. Both Frontends: `alert()` Used for Error Handling
- **Files:** `frontend/src/components/pages/overview/OrdersPage.tsx`, `KitchenDisplayPage.tsx`, `ErrorBoundary.tsx`
- **Issue:** Native `alert()` dialogs block the UI thread, provide poor UX, and are inaccessible to screen readers. Found 15+ occurrences in admin frontend.
- **Fix:** Replace with a toast/notification system.

### H10. Zero Meaningful Test Coverage
- **Finding:** Only `backend/tests/test_health.py` exists (6 basic tests: import + health endpoint). No frontend unit tests, no integration tests, no E2E tests, no API contract tests.
- **Fix:** Add pytest integration tests for critical paths (auth, orders, payments, wallet). Add Vitest/Jest for frontend components. Add Playwright for critical user flows.

---

## 🟡 MEDIUM SEVERITY ISSUES

### M1. Backend: `RequestSizeLimitMiddleware` Reads Entire Body Into Memory
- **Issue:** Checks request size by doing `await request.body()`, which buffers the entire payload in memory before routing. Under high concurrent upload load, this creates memory pressure.
- **Fix:** Offload request size limiting to the reverse proxy (Caddy/Nginx) or use streaming ASGI middleware.

### M2. Backend: `IdempotencyMiddleware` Memory Leak Risk
- **Issue:** Caches response bodies in memory with no maximum cache size or TTL enforcement.
- **Fix:** Add cache size limits, TTL eviction, or move to Redis.

### M3. Backend: Payment Webhook Lacks Amount Validation
- **File:** `backend/app/api/v1/endpoints/common/pg_payment_webhook.py`
- **Issue:** The payment gateway webhook does not validate the received `amount` against a pre-registered expected amount. If the gateway is misconfigured or compromised, arbitrary amounts could be credited.
- **Fix:** Pre-register expected top-up amounts in a pending state and validate against them.

### M4. Backend: `PaymentMethodCreate.last4` Has No Validation
- **File:** `backend/app/schemas/payment.py` (line 22)
- **Issue:** Accepts `Optional[str] = None` with no regex validation. A client could send arbitrary strings.
- **Fix:** Add regex validator ensuring exactly 4 digits.

### M5. Backend: CORS Origins Not Validated Against Wildcards
- **File:** `backend/app/core/config.py`
- **Issue:** `CORS_ORIGINS` is split by comma with no validation that it doesn't contain `*` when `allow_credentials=True`. An ops misconfiguration could open credential-hijacking.
- **Fix:** Add startup validation that rejects wildcard origins when credentials are enabled.

### M6. Backend: OTP Codes Logged at DEBUG Level
- **File:** `backend/app/services/sms.py`
- **Issue:** OTP codes are logged at DEBUG level. A misconfigured production log level could leak OTPs to log aggregators.
- **Fix:** Never log OTP codes at any log level.

### M7. PWA: Push Notifications Are a Dead Feature
- **Finding:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is a placeholder. The service worker has a `push` handler, but no UI code requests permission, subscribes the user, or sends the subscription to the backend.
- **Fix:** Either implement the full push subscription flow or remove the dead code to reduce attack surface.

### M8. PWA: Silent `catch` Blocks Hide Production Bugs
- **Files:** `customer-app/src/lib/cartSync.ts`, `hooks/useAuthFlow.ts`, `components/HomePage.tsx`, and many others
- **Issue:** Empty `catch {}` or `catch { /* ignore */ }` blocks swallow errors, making production debugging nearly impossible.
- **Fix:** Log all caught errors to a centralized error tracking service (Sentry, etc.).

### M9. PWA: Divs Used as Interactive Elements (Accessibility)
- **Files:** `MenuPage.tsx`, `CartPage.tsx`, `OrdersPage.tsx`
- **Issue:** Product cards, cart items, and order cards are `<div onClick={...}>` elements. These are not keyboard-focusable and lack `role="button"` / `tabIndex={0}`.
- **Fix:** Convert to `<button>` elements or add proper ARIA roles and keyboard handlers.

### M10. Admin Frontend: Accessibility Is Critically Lacking
- **Issues:**
  - Only ~9 ARIA attributes exist across the entire `src/` directory
  - No `aria-label` on icon-only buttons (profile, logout, sidebar toggle, DataTable actions)
  - Sidebar navigation uses `<div onClick>` instead of `<button>` or `<a>` tags
  - No focus trapping in Modals/Drawers
  - No skip navigation link for keyboard users
  - No `aria-live` regions for dynamic content updates
  - Tables lack `<caption>` or `scope="col"`
- **Fix:** Conduct an accessibility audit using axe-core; add ARIA attributes; convert interactive divs to semantic elements.

### M11. Admin Frontend: DataTable Uses Array Index as `key`
- **File:** `frontend/src/components/ui/DataTable.tsx`
- **Issue:** `key={idx}` on rows causes unnecessary re-renders and state loss when sorting/filtering.
- **Fix:** Use unique record IDs as keys.

### M12. Admin Frontend: `parseFloat` Without NaN Checks
- **Files:** `MenuPage.tsx`, `InventoryPage.tsx`, `AddVoucherModal.tsx`
- **Issue:** `parseFloat` results are sent directly to API. Invalid input sends `NaN` to the backend.
- **Fix:** Add `isNaN` validation before API calls.

### M13. PWA: No Request Timeout on Axios Instance
- **File:** `customer-app/src/lib/api.ts`
- **Issue:** No global `timeout` configured. A hanging request will spin loaders indefinitely.
- **Fix:** Add a reasonable timeout (e.g., 30s) and handle timeout errors gracefully.

### M14. PWA: Wallet Top-Up Has No Confirmation Gate
- **File:** `customer-app/src/components/WalletPage.tsx`
- **Issue:** Calls `/wallet/topup` immediately on button click with no secondary confirmation or PIN/biometric gate.
- **Fix:** Add a confirmation modal or require biometric authentication for financial transactions.

### M15. PWA: 401 Refresh Can Loop
- **File:** `customer-app/src/lib/api.ts`
- **Issue:** If the refresh endpoint returns 401 (revoked refresh token), the interceptor falls through to `window.location.reload()`, which could loop if the server keeps returning 401.
- **Fix:** Track refresh failure count and force logout after one failed refresh attempt.

### M16. Both Frontends: `any` Types Prevalent Due to Disabled ESLint Rule
- **Files:** Both `eslint.config.mjs` files disable `@typescript-eslint/no-explicit-any`
- **Issue:** 47+ occurrences of `: any` in admin, multiple in PWA. This defeats TypeScript's primary purpose.
- **Fix:** Re-enable the rule and fix type definitions, especially for API responses.

### M17. Admin Frontend: No State Management Library
- **File:** `frontend/src/app/page.tsx`
- **Issue:** All state is hoisted to the root component and drilled down 3-4 levels. The `useMerchantData` hook manages ~20 unrelated state variables.
- **Fix:** Introduce React Context for auth/store selection, or adopt Zustand (already used in PWA).

### M18. Admin Frontend: `apiUpload` Missing 401 Refresh Handling
- **File:** `frontend/src/lib/merchant-api.tsx`
- **Issue:** `apiUpload` does not dispatch `merchant-auth-expired` on 401 failure, unlike `apiFetch`.
- **Fix:** Unify auth error handling across all API wrappers.

---

## 🟢 LOW SEVERITY / TECHNICAL DEBT

### L1. Inconsistent API Response Formats
- **Issue:** Some endpoints return `{"message": "..."}`, others return `{"detail": "..."}`. FastAPI's default is `detail`; mixing them creates client-side confusion.
- **Fix:** Standardize on `detail` for errors, `message` only for success confirmations.

### L2. Schema Field Aliases Create Technical Debt
- **File:** `backend/app/schemas/*.py`
- **Issue:** Widespread use of `AliasChoices` to support both camelCase and snake_case. This bloats schemas and creates ambiguity.
- **Fix:** Standardize on snake_case for the API; handle conversion at the client gateway if needed.

### L3. Deprecated Security Header
- **File:** Both frontends' `next.config.ts`
- **Issue:** `X-XSS-Protection: 1; mode=block` is deprecated and can introduce vulnerabilities in older browsers.
- **Fix:** Remove this header; rely on CSP instead.

### L4. Hardcoded Business Logic
- **Files:** `WalletTopUpPage.tsx` (`TOPUP_PRESETS = [20, 50, 100, 200, 300, 500]`), `lib/config.ts` (fallback URLs)
- **Issue:** Business rules and domains are hardcoded in source code.
- **Fix:** Move to environment variables or a config API endpoint.

### L5. CSS Not Code-Split
- **File:** `customer-app/src/app/globals.css`
- **Issue:** Imports 50+ individual CSS files. In a Next.js app, this loads all styles upfront regardless of which page is active.
- **Fix:** Use CSS Modules or page-level style imports.

### L6. PWA: TODO in Production Code
- **File:** `customer-app/src/components/MyRewardsPage.tsx` (line 47)
- **Issue:** `const usedThisMonth = 2; // TODO: fetch from backend` — hardcoded mock data in production code.
- **Fix:** Implement the backend endpoint or remove the feature.

### L7. Admin Frontend: Inline Style Objects in Render
- **Files:** `DataTable.tsx`, `MenuPage.tsx`
- **Issue:** Inline style objects are recreated on every render, defeating React reconciliation.
- **Fix:** Use CSS classes or `useMemo` for dynamic styles.

### L8. Backend: `DB_PASSWORD` Is Redundant
- **File:** `backend/app/core/config.py`
- **Issue:** `DB_PASSWORD` is declared separately even though the password is already in `DATABASE_URL`. Increases secrets surface area.
- **Fix:** Remove `DB_PASSWORD` and parse from `DATABASE_URL` if needed.

### L9. Backend: Health Check Logs Full Exception String
- **File:** `backend/app/main.py` or health endpoint
- **Issue:** Health check failures log full exception strings, which could leak internal connection details.
- **Fix:** Log generic health failure messages; log specifics only at DEBUG.

### L10. Backend: Subprocess Execution in Admin PWA Management
- **File:** `backend/app/api/v1/endpoints/admin/admin_pwa_mgmt.py`
- **Issue:** Runs `npm run build` via `asyncio.create_subprocess_exec`. While arguments are hardcoded and access is gated, this is a potential remote code execution vector if the endpoint is ever compromised.
- **Fix:** Remove this endpoint in production builds; use CI/CD pipelines for deployments instead.

---

## INFRASTRUCTURE & DEVOPS FINDINGS

### Strengths
- Docker Compose setup is clean and functional
- Caddy reverse proxy with auto-HTTPS is well-configured
- Backend auto-migration on startup via `docker-entrypoint.sh`
- Non-root users in Dockerfiles (good security practice)
- Security headers middleware present (CSP, HSTS, X-Frame-Options)

### Issues
1. **No health check dependencies in Docker Compose:** Services can start in incorrect order.
2. **Uploads volume not restricted by file type at the container level:** Could allow executable uploads if validation is bypassed.
3. **CI/CD runs `pytest tests/` but there are virtually no tests:** The `backend-tests` job will pass trivially, giving false confidence.
4. **No automated security scanning in CI:** No `bandit`, `safety`, `npm audit`, or container scanning.
5. **No database backup strategy documented:** 63 tables with customer data and no backup/restore docs.
6. **Environment variables in docker-compose are not validated:** `OTP_BYPASS_ALLOWED: "true"` present in `.env`/`docker-compose.yml` creates risk of accidental production exposure.

---

## CROSS-CUTTING CONCERNS

### Security Posture
The system has **authentication** (JWT with blacklisting) and **authorization** (RBAC with roles and permissions), but lacks defense in depth:
- No CSRF tokens (relies on SameSite=Strict cookies)
- No input sanitization at the API boundary
- No rate limiting that survives process restarts
- No audit trail for failed authentication attempts
- Uploads served without auth
- Password policy is weak (6 chars)

### Performance
- Both frontends disable image optimization entirely
- Admin frontend re-fetches all data on any filter change
- No virtualized lists for large datasets
- No request deduplication or caching layer
- PWA CSS is loaded monolithically
- Service worker lacks navigation preload

### Accessibility
- Admin frontend is nearly unusable with assistive technology
- PWA has some ARIA support but many interactive divs
- Neither app has been tested with screen readers
- No focus management in drawers (admin) or bottom sheets (PWA)

### Maintainability
- Good folder structure and component organization
- Documentation is excellent
- TypeScript strict mode is enabled but undermined by `any` types
- No tests to support refactoring
- 22 model files and 19 schema files are well-separated

---

## PRIORITIZED ACTION PLAN

### Week 1: Critical Security Fixes
1. Fix `require_permission` `NameError` in `security.py`
2. Remove `dangerouslySetInnerHTML` from `PhoneInput.tsx` or add DOMPurify
3. Replace `setattr` loops in admin endpoints with explicit field allowlists
4. Add authentication to `/uploads` static file serving
5. Remove password display from `StaffPage.tsx`
6. Set `OTP_BYPASS_ALLOWED=false` and `NEXT_PUBLIC_OTP_BYPASS=false` in all envs
7. Add `NODE_ENV` guard to `LoginModal.tsx` OTP bypass

### Week 2: High-Priority Hardening
8. Implement server-side XSS sanitization on all user-generated text fields
9. Fix raw SQL f-strings in admin reset endpoints
10. Prevent order history backdating
11. Enforce 8-character minimum password policy
12. Add issuer/audience verification to JWT operations
13. Replace in-memory rate limiting with Redis
14. Replace `alert()` calls with toast notifications
15. Add `images.unoptimized: false` and configure proper image optimization

### Week 3: Frontend Architecture & a11y
16. Split admin `page.tsx` mega-effect into per-data-source effects or adopt TanStack Query
17. Introduce state management (Zustand/Context) to eliminate prop drilling in admin
18. Add ARIA labels to all icon-only buttons
19. Convert sidebar navigation `<div>` elements to `<button>` tags
20. Add focus trapping to Modal and Drawer components
21. Fix DataTable `key={idx}` to use unique IDs
22. Add `parseFloat` NaN validation across all numeric inputs

### Week 4: Testing & Infrastructure
23. Write pytest integration tests for: auth, orders, payments, wallet, staff CRUD
24. Add Vitest unit tests for critical PWA components (cart, checkout, auth)
25. Add Playwright E2E tests for critical flows (order placement, wallet top-up)
26. Add `npm audit` and `bandit` to CI pipeline
27. Document database backup/restore procedures
28. Add Docker Compose health check dependencies

### Month 2: Polish & Performance
29. Implement push notification subscription flow or remove dead code
30. Add request timeouts to Axios instance
31. Add wallet top-up confirmation gate
32. Fix PWA silent catch blocks with proper error logging
33. Fix 401 refresh loop in API interceptor
34. Re-enable `@typescript-eslint/no-explicit-any` and fix types
35. Add CSS code splitting to PWA
36. Implement virtualized lists for large tables

---

## POSITIVE FINDINGS (What's Working Well)

1. **Documentation is exceptional:** Comprehensive, well-organized, cross-referenced docs covering architecture, schema, API, deployment, and UI/UX.
2. **Database design is solid:** 63 tables with proper foreign keys, enums, and a trigger for table occupancy. SQLAlchemy 2.0 async patterns are correct.
3. **JWT implementation is robust:** Short-lived access tokens, rotated refresh tokens, blacklisting, and secret rotation support.
4. **Wallet transactions are atomic:** Uses `UPDATE ... WHERE balance >= amount` with `returning()` to prevent race conditions and double-spending.
5. **PWA offline support is implemented:** Service worker with cache strategies, background sync queue for offline orders, and idempotency keys.
6. **File upload security is good:** Magic bytes validation, EXIF stripping, UUID filenames, and image resizing via Pillow.
7. **Audit logging exists:** `log_action()` is used throughout the backend for accountability.
8. **Builds succeed:** Both frontends compile cleanly with TypeScript strict mode.
9. **Docker setup is production-oriented:** Multi-stage builds, non-root users, auto-migration.
10. **Business logic separation is clean:** Loyalty, referrals, and commerce logic are isolated in `commerce.py`.

---

## CONCLUSION

The FNB Super App is an impressive, feature-complete MVP with excellent documentation and a solid architectural foundation. It successfully implements a complex F&B loyalty and ordering system with dine-in QR flows, wallet payments, staff management, and marketing tools.

**However, it is currently at the "functional prototype" stage, not production-ready.** The combination of:
- A runtime-crashing permission dependency factory
- XSS vectors in the PWA
- Mass-assignment vulnerabilities in admin endpoints
- Unauthenticated file serving
- Weak password policy
- Zero meaningful test coverage

...means **this system should not handle real customer data or payment transactions until the Critical and High issues are resolved.**

The good news is that the codebase is well-structured, the documentation is comprehensive, and the team has shown strong engineering practices (async SQLAlchemy, atomic wallet updates, JWT blacklisting). With 2-4 weeks of focused security hardening and testing, this can become a production-grade platform.

**Recommended next step:** Address the Week 1 Critical fixes immediately, then schedule the Week 2-4 items before any public launch.
