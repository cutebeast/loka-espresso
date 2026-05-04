# FNB Super App — Re-Audit Report (Round 2)
**Date:** 2026-05-04  
**Scope:** Verify fixes, validate intentional design decisions, identify remaining issues  

---

## Executive Summary

You have made **genuine progress** since the first audit. Several critical and high-priority issues have been fixed, and your documentation has been reorganized into an excellent hierarchical structure. The system is closer to production-ready, but there are still material issues remaining — including one where your understanding of Pydantic behavior is factually incorrect, and a few business-logic bypass vulnerabilities that the `setattr` pattern enables.

**Current State: B-** (up from C+)

---

## ✅ VERIFIED FIXES (Good Work)

| Issue | Status | Evidence |
|-------|--------|----------|
| `require_permission` NameError | **FIXED** | `security.py:264` now correctly returns `checker` (was `role_checker`). Still dead code, but syntactically correct. |
| PWA XSS via `dangerouslySetInnerHTML` | **FIXED** | `PhoneInput.tsx` — grep returns 0 matches for `dangerouslySetInnerHTML` in `customer-app/src/`. |
| PWA Axios timeout | **FIXED** | `customer-app/src/lib/api.ts:9` now has `timeout: 30000`. |
| PWA 401 refresh loop | **FIXED** | `api.ts` uses `originalRequest._retry`, deduplicates with `_refreshPromise`, and removed `window.location.reload()`. |
| Admin `apiUpload` 401 handling | **FIXED** | `merchant-api.tsx:90-100` now retries with refreshed token on 401. |
| Admin wallet confirmation gate | **FIXED** | `WalletTopUpPage.tsx` now shows a confirmation modal before executing top-up. |
| Password minimum length | **FIXED** (partially) | `auth.py:484` now checks `< 8` instead of `< 6`. |
| Backend XSS sanitization | **FIXED** | `bleach` is now actively used in `pwa_surveys.py` and `admin_feedback.py`. |
| JWT issuer/audience verification | **FIXED** (partially) | `_decode_token` and `refresh_token` endpoint now verify `iss`/`aud`. |
| Some silent catches | **IMPROVED** | `NotificationsPage.tsx`, `QRScanner.tsx`, `LoginModal.tsx` now log errors instead of swallowing them. |
| Admin sidebar semantic HTML | **IMPROVED** | Outer wrapper is now `<nav>` instead of `<div>`. |
| Documentation reorganization | **EXCELLENT** | New hierarchical `0xx` numbering, `010-project-state.md` is a canonical current-state doc. |

---

## ⚠️ CORRECTION: Your Pydantic Claim Is Incorrect

You stated that the `setattr` loops are safe because **"Pydantic schemas reject unknown fields."**

**This is factually wrong.** Pydantic v2's default behavior is `extra='ignore'`, not `extra='forbid'`. Unknown fields are **silently discarded** — no error is raised, no rejection occurs.

```python
# Pydantic v2 default behavior
from pydantic import BaseModel
class Foo(BaseModel):
    x: int

Foo(x=1, y=2)  # No error. y is silently ignored.
Foo.model_validate({'x': 1, 'y': 2})  # No error. y is silently ignored.
```

### What This Means Practically

**The good news:** Because `password_hash`, `created_at`, `deleted_at`, and `is_superuser` are **not present in any Update schema**, an attacker cannot inject those fields. The `setattr` loops are safe from *arbitrary attribute injection*.

**The bad news:** The real vulnerability is not unknown fields — it's **known fields in the schema that shouldn't be user-updatable or that bypass business logic.** I found three concrete cases:

### 🔴 Issue 1: Broadcast Status Bypass (`admin_broadcasts.py`)

```python
# Line 153-173: update_broadcast uses BroadcastCreate (not BroadcastUpdate)
for key, value in data.model_dump(exclude_unset=True).items():
    setattr(obj, key, value)
```

`BroadcastCreate` includes `status: str = "draft"`. The endpoint checks `if obj.status not in ("draft", "pending")` **before** the setattr loop, but it does **NOT** prevent setting `status="sent"` on a draft broadcast.

**Attack:** An admin can `PUT /admin/broadcasts/{id}` with `{"status": "sent"}` to mark a broadcast as sent **without triggering the actual send logic** (creating `Notification` rows, counting device tokens, setting `sent_at`). The broadcast ends up in an inconsistent state.

**Fix:** Create a `BroadcastUpdate` schema that **excludes `status`**. Force status changes through the dedicated `/send` endpoint only.

### 🟡 Issue 2: Campaign Metric Tampering (`admin_extras.py`)

`MarketingCampaignUpdate` includes `total_recipients: Optional[int] = None`. This is a computed metric field. An admin can arbitrarily inflate it: `{"total_recipients": 999999}`.

**Fix:** Remove `total_recipients` from the Update schema. It should be computed by the system.

### 🟡 Issue 3: OrderCreate Accepts `created_at` (`schemas/order.py`)

```python
class OrderCreate(BaseModel):
    ...
    created_at: Optional[datetime] = None  # line 22
```

While `order_crud.py` currently ignores this field, the API surface accepts it. A future refactor could accidentally persist it.

**Fix:** Remove `created_at` from `OrderCreate`.

### Verdict on Mass-Assignment

Your design is **defensible for preventing arbitrary attribute injection**, but it is **not safe from business logic bypasses**. The `setattr` pattern combined with overly broad schemas creates real vulnerabilities. I recommend:

1. Create dedicated `*Update` schemas that exclude non-updatable fields.
2. Add `extra='forbid'` to all Update schemas if you want to actually **reject** unknown fields (rather than silently ignore them).
3. Add `hasattr(obj, k)` guards to all setattr loops as defense-in-depth.

---

## 🔴 CRITICAL ISSUES REMAINING

### C1. Backend: Order History Backdating
- **File:** `app/api/v1/endpoints/common/order_status.py:93-94`
- **Status:** UNCHANGED
- **Issue:** Staff can provide `completed_at` to backdate order status changes. No validation.
- **Fix:** Validate `completed_at` is within last 24 hours and not in the future.

### C2. PWA: Wallet Top-Up Has No Confirmation Gate
- **File:** `customer-app/src/components/WalletPage.tsx:81-100`
- **Status:** UNCHANGED (you fixed it in admin frontend only)
- **Issue:** Customer PWA directly POSTs to `/wallet/topup` with no confirmation dialog.
- **Fix:** Add confirmation modal to customer PWA wallet top-up.

### C3. Backend: Admin OTP Lookup Exposes Plaintext Codes
- **File:** `app/api/v1/endpoints/admin/admin_system.py:26-51`
- **Status:** UNCHANGED
- **Issue:** `/admin/otps` returns full OTP codes to any HQ user. Blocked in production by env check, but still exposes 2FA codes in staging/dev.
- **Fix:** Never return plaintext OTP codes via API, even in non-production environments.

---

## 🟠 HIGH SEVERITY ISSUES REMAINING

### H1. Backend: In-Memory Rate Limiting & Idempotency
- **Status:** UNCHANGED
- **Issue:** Python dicts in process memory. Bypassable across workers/instances.
- **Fix:** Redis backend for rate limiting and idempotency.

### H2. Both Frontends: Images Completely Unoptimized
- **Status:** UNCHANGED in both
- **Issue:** `images: { unoptimized: true }` in both `next.config.ts` files.
- **Fix:** Remove or configure a CDN loader.

### H3. Backend: Raw SQL f-Strings in Admin Reset
- **Status:** UNCHANGED
- **Issue:** `text(f"DELETE FROM {table_name}")` with allowlist mitigation. Brittle.
- **Fix:** Use SQLAlchemy `delete()` with table objects.

### H4. Backend: Payment Webhook Lacks Amount Validation
- **Status:** UNCHANGED
- **Issue:** POS/delivery webhooks process "paid" status without validating amount against order total.
- **Fix:** Pre-register expected amounts and validate in webhooks.

### H5. Backend: `RequestSizeLimitMiddleware` Memory Issue
- **Status:** UNCHANGED
- **Issue:** `await request.body()` buffers entire payload before size check.
- **Fix:** Offload to reverse proxy or use streaming ASGI middleware.

### H6. Admin Frontend: Massive `useEffect` Over-Fetching
- **Status:** UNCHANGED
- **Issue:** `page.tsx` has a `useEffect` with 15 dependencies causing redundant API calls.
- **Fix:** Split into per-data-source effects or adopt TanStack Query.

### H7. Admin Frontend: `alert()` Used for Errors
- **Status:** UNCHANGED
- **Issue:** 15+ occurrences in `OrdersPage.tsx`, `KitchenDisplayPage.tsx`, `ErrorBoundary.tsx`.
- **Fix:** Replace with toast/notification system.

### H8. PWA: OTP Bypass Missing `NODE_ENV` Guard
- **File:** `customer-app/src/components/auth/LoginModal.tsx:103`
- **Status:** UNCHANGED
- **Issue:** Only checks `NEXT_PUBLIC_OTP_BYPASS === 'true'` without verifying `NODE_ENV !== 'production'`.
- **Fix:** Add the same guard that exists in `AuthFlow.tsx`.

---

## 🟡 MEDIUM SEVERITY ISSUES REMAINING

| # | Issue | Location | Status |
|---|-------|----------|--------|
| M1 | `last4` unvalidated | `schemas/payment.py:32` | UNCHANGED |
| M2 | CORS wildcard not validated | `core/config.py:32` | UNCHANGED |
| M3 | OTP logged at DEBUG | `services/sms.py:48` | UNCHANGED |
| M4 | `_blacklist_token` missing issuer/audience | `auth.py:115` | UNCHANGED |
| M5 | `check_session` missing issuer/audience | `auth.py:138` | UNCHANGED |
| M6 | Password error message wrong | `auth.py:485` says "6 characters" but checks `< 8` | UNCHANGED |
| M7 | Push notifications unimplemented | PWA dead feature | UNCHANGED |
| M8 | Silent catch blocks | `cartSync.ts`, `useAuthFlow.ts`, `HomePage.tsx` | PARTIALLY FIXED |
| M9 | Divs as interactive elements | `MenuPage.tsx`, `CartPage.tsx`, `OrdersPage.tsx` | UNCHANGED |
| M10 | Admin accessibility critically lacking | Zero `aria-label`, sidebar items still `<div>` | UNCHANGED |
| M11 | `DataTable` `key={idx}` | `DataTable.tsx:98` | UNCHANGED |
| M12 | `parseFloat` without NaN checks | 10+ occurrences across admin frontend | UNCHANGED |
| M13 | Admin no state management | Still prop-drilling 30+ props | UNCHANGED |
| M14 | PWA `ListCard.tsx` innerHTML | `src/components/shared/ListCard.tsx:36` | NEW FINDING |
| M15 | Admin `WalletTopUpPage` modal nesting bug | Confirmation dialog nested inside conditional | NEW FINDING |
| M16 | `OrderCreate` accepts `created_at` | `schemas/order.py:22` | NEW FINDING |
| M17 | MyRewardsPage hardcoded TODO | `MyRewardsPage.tsx:47` | UNCHANGED |
| M18 | Zero meaningful tests | Only `test_health.py` (7 smoke tests) | UNCHANGED |
| M19 | Root `.env` contains live secrets | Twilio & MaxMind credentials | UNCHANGED |

---

## NEW ISSUES FOUND IN THIS ROUND

### N1. Broadcast Status Bypass (High)
Described above in the Pydantic correction section. `update_broadcast` uses `BroadcastCreate` as its input schema, allowing `status: "sent"` to be set without triggering send logic.

### N2. Campaign Metric Tampering (Medium)
`MarketingCampaignUpdate` includes `total_recipients`, allowing arbitrary metric manipulation.

### N3. `WalletTopUpPage` Modal Nesting Bug (Medium)
The confirmation dialog in `WalletTopUpPage.tsx` (lines 210-226) is nested **inside** `{result.newBalance !== undefined}` conditional block. The modal will only render when a previous top-up result with `newBalance` exists, making it unreliable.

### N4. `ListCard.tsx` innerHTML Assignment (Medium)
`customer-app/src/components/shared/ListCard.tsx:36` assigns raw HTML via `target.innerHTML = \`<svg>...</svg>\``. While the string is mostly static, this is a direct DOM manipulation pattern that bypasses React's XSS protections. Additionally, `onError` is attached to a `<div>` where it will never fire (images don't error on divs).

### N5. Password Error Message Contradiction (Low)
`auth.py:484-485` checks `len(body.new_password) < 8` but the error message says `"New password must be at least 6 characters"`.

### N6. `OrderCreate` Accepts `created_at` (Low)
The schema includes `created_at: Optional[datetime] = None`. While ignored by CRUD now, it shouldn't be accepted at the API boundary.

---

## INTENTIONAL DESIGN DECISIONS — ACCEPTED

| Decision | Rationale | Verdict |
|----------|-----------|---------|
| Public uploads via UUID filenames | Images must be public for PWA; UUIDs prevent guessing | ✅ **Accepted** — documented in `010-project-state.md` |
| Staff password display in admin UI | Standard admin UX for credential delivery; behind auth; auto-fades | ✅ **Accepted** — documented in `010-project-state.md` |
| OTP bypass pre-Twilio | Interim measure; disabled in production; documented | ✅ **Accepted** — documented in `060-deployment.md` |
| `setattr` loops for updates | Defensible for unknown-field injection (no dangerous fields in schemas), but NOT safe from business-logic bypasses | ⚠️ **Partially accepted** — see correction above |

---

## RECOMMENDED PRIORITY ACTIONS

### This Week
1. **Fix Broadcast status bypass** — create `BroadcastUpdate` without `status` field
2. **Fix order backdating** — validate `completed_at` within reasonable window
3. **Fix PWA wallet confirmation** — add confirmation modal to customer PWA
4. **Fix OTP lookup exposure** — never return plaintext OTP codes
5. **Fix PWA OTP bypass guard** — add `NODE_ENV !== 'production'` check to `LoginModal.tsx`

### Next Sprint
6. **Fix `MarketingCampaignUpdate`** — remove `total_recipients`
7. **Fix `WalletTopUpPage` modal nesting** — move dialog to root JSX level
8. **Fix `ListCard.tsx` innerHTML** — use React JSX for fallback SVG
9. **Fix password error message** — change "6" to "8"
10. **Fix `OrderCreate`** — remove `created_at` field
11. **Replace `alert()` calls** — implement toast system
12. **Enable image optimization** — remove `unoptimized: true`

### Month 2
13. Redis-backed rate limiting
14. Payment webhook amount validation
15. Streaming request size limit
16. Admin accessibility pass (aria-labels, keyboard nav)
17. `parseFloat` NaN validation across admin frontend
18. Split admin mega-useEffect or adopt TanStack Query
19. Write integration tests for auth, orders, payments, wallet
20. Remove live secrets from root `.env`

---

## CONCLUSION

You have made **real, measurable progress** on security and stability. The documentation reorganization is excellent, the `require_permission` bug is fixed, the XSS vector is removed, timeouts are in place, and the 401 loop is eliminated. The system is **closer to production-ready** than it was.

However, the remaining issues are not trivial:
- **3 critical** issues (backdating, wallet confirmation, OTP exposure)
- **8 high** issues (rate limiting, unoptimized images, raw SQL, webhook validation, memory pressure, over-fetching, alerts, OTP bypass guard)
- **Business logic bypasses** in broadcast and campaign updates that the `setattr` pattern enables

The mass-assignment issue is **more nuanced than either of us initially assessed**. You're right that arbitrary field injection is blocked by the schema boundary, but the `setattr` + broad schema combination still allows business-logic bypasses. The fix is tighter `*Update` schemas, not removing `setattr` entirely.

**Bottom line: Another 1-2 weeks of focused fixes on the items above will get this to a genuine production grade.**
