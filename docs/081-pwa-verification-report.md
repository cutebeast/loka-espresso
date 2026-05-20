# PWA Verification & Gap Report

> Date: 2026-05-19 | Status: All 9 documented fixes verified ✅ | 5 additional gaps found

---

## 1. Verified Fixes (All 9 Confirmed)

| # | Fix | Verification Method | Status |
|---|-----|---------------------|--------|
| 1 | `/content/version` mapping removed from `api.ts` | Grep — no match found | ✅ |
| 2 | Address ID suffix mapping `/users/me/addresses/{id}` → `/me/addresses/{id}` | `api.ts:89-92` prefix match exists | ✅ |
| 3 | Cart `store_id` made optional (`Query(1, ge=1)`) | `customer/cart.py:23,31,46` | ✅ |
| 4 | Voucher payload `code:` → `voucher_code:` | `VoucherRewardSelector.tsx:43` | ✅ |
| 5 | `'referral'` added to `VALID_PAGES` | `usePageRouter.ts:11` | ✅ |
| 6 | `SurveysPage.tsx` deleted + dynamic import removed | File not found, no import in AppShell | ✅ |
| 7 | `'surveys'` removed from `PageId`, `VALID_PAGES`, `SUB_PAGES`, `GUEST_RESTRICTED` | Grep — not found in any array | ✅ |
| 8 | Profile menu "Surveys" → "Promotions" | `ProfilePage.tsx:93` shows Promotions | ✅ |
| 9 | 39 dead components documented | Not causing runtime errors | ✅ |

---

## 2. Additional Gaps Found

### 🔴 Gap A: `checkNotifications` calls non-existent endpoint

**Location:** `useVersionCheck.ts:40-74`  
**Issue:** Every 5 minutes, the PWA calls `GET /content/notifications` which **does not exist** in the backend. The `.catch()` silently swallows the 404.

**Fix:** Replace `/content/notifications` with `/notifications/me` and remove the `last_check` query param logic (backend doesn't support it). Or simply delete the `checkNotifications` feature entirely since notifications are already fetched on the NotificationsPage.

### 🟡 Gap B: Events page back button goes to Home instead of Profile

**Location:** `AppShell.tsx:206`  
**Issue:** `EventsPage` is accessed exclusively from the Profile menu (`ProfilePage.tsx:92`), but its `onBack` navigates to `home`. This is inconsistent with `ReservationsPage` which correctly goes back to `profile`.

**Fix:** Change `onBack={() => setPage('home')}` → `onBack={() => setPage('profile')}`.

### 🟡 Gap C: 13 silent catches still in PWA

**Location:** Various files  
**List:**
- `MyCardPage.tsx:33,44` — API + QR generation failures
- `NotificationsPage.tsx:85` — Config fetch failure
- `AccountDetailsPage.tsx:41` — Profile fetch failure
- `OrderDetailPage.tsx:128,129` — navigator.share/clipboard (acceptable)
- `SplashScreen.tsx:40` — Splash fetch failure
- `cartSync.ts:235` — Cart sync failure
- `LocaleProvider.tsx:22,33` — localStorage (acceptable)
- `localeStore.ts:28,39,45` — localStorage (acceptable)

**Fix:** Replace `.catch(() => {})` with `.catch((err) => console.error(...))` for the non-browser-API ones.

### 🟡 Gap D: Home page "Featured Items" always empty

**Root cause:** Database has 0 items with `is_featured=true` (29 total, 0 featured). The fallback to all-available-items should work, but...

**Secondary issue:** The public menu endpoint (`/menu/stores/{store_id}`) has a **pre-existing Pydantic validation bug** with lazy-loaded `MenuModifierGroup.options` relationships. When the endpoint tries to serialize modifier groups, it crashes with `MissingGreenlet: greenlet_spawn has not been called`. This causes a 500 error.

**Impact:** Home page featured section and menu browsing may intermittently fail.

**Fix (backend):** Add `selectinload` for modifier group options in `public/menu.py`, or use `from_attributes=True` with explicit field mapping.

### 🟢 Gap E: `/auth/logout` endpoint missing

**Impact:** Low. Logout is handled client-side (clears localStorage tokens). No server-side token revocation occurs. Acceptable for MVP.

---

## 3. Navigation Improvement Recommendations

All suggestions preserve the approved UI/UX design. No visual changes — only flow and grouping improvements.

### 3.1 Profile Menu Grouping

The profile menu currently has 11 items in one flat list. **Suggestion:** Add visual section headers to group related items:

```
── LOYALTY & REWARDS ──
  My Rewards
  My Vouchers
  My Card
  Referral
  Promotions

── ACCOUNT ──
  Payment Methods
  Saved Addresses
  Notifications
  Reservations
  Events

── SUPPORT ──
  Settings
  Help & Support
```

**Why:** Reduces cognitive load. Users can scan sections instead of 11 items. Implementation: add `<div className="profile-section-header">` elements between menu item groups.

### 3.2 Events Back Navigation

**Current:** Events → Back → Home (jarring, since user came from Profile)  
**Recommended:** Events → Back → Profile

### 3.3 Home Page Quick Actions

**Current:** Wallet is only accessible via Profile → Wallet (2 taps from home)  
**Recommended:** Add a small "Wallet" quick-action button to the `HomeHeader` (next to notification bell). This is a common pattern in food apps (Grab, Foodpanda).

**Implementation:** Reuse existing `Wallet` icon from `lucide-react`. Style as a ghost button matching the notification bell.

### 3.4 Bottom Nav Active State for Sub-Pages

**Current:** `getActiveNavId` correctly maps sub-pages to parent tabs.  
**One gap:** `'events'` is mapped to `'rewards'` in `BottomNav.tsx:14`, but Events is accessed from Profile menu, not Rewards. This is harmless (events page doesn't show bottom nav since it uses its own layout).

### 3.5 Cart Badge Visibility

**Current:** Cart badge only shows on Menu tab in bottom nav.  
**Recommended:** Consider showing cart total on Home page header too (near notification bell) when cart has items. This encourages checkout from any page.

---

## 4. Endpoint Coverage Summary

### Working (tested through PWA proxy)

| Endpoint | Data | Notes |
|----------|------|-------|
| `GET /promos/banners` | ✅ 0 banners | No active banners in DB |
| `GET /content/information` | ✅ 1 card | Brewing Guide |
| `GET /content/legal/terms` | ✅ Terms & Conditions | |
| `GET /content/legal/privacy` | ✅ Privacy Policy | |
| `GET /splash` | ✅ Summer splash | |
| `GET /config/bootstrap` | ✅ 2 stores, 3 tiers | |
| `POST /stores/tables/scan` | ✅ Valid QR works | Invalid QR returns 403 |
| `GET /me` | ✅ Test User profile | |
| `PUT /me` | ✅ Name update works | PUT alias functional |
| `GET /me/addresses` | ✅ 1 address | |
| `GET /orders` | ✅ 0 orders | Customer has no orders |
| `GET /wallet/me` | ✅ | |
| `GET /loyalty/me` | ✅ | |
| `GET /vouchers/me` | ✅ | |
| `GET /rewards/me` | ✅ | |
| `GET /payments/methods` | ✅ 0 methods | No saved methods |
| `POST /feedback` | ✅ Submitted (id=7) | Auth required |

### Broken / Needs Attention

| Endpoint | Status | Fix Required |
|----------|--------|--------------|
| `GET /menu/stores/{id}` | 🔴 500 error | Backend Pydantic lazy-load bug |
| `GET /content/notifications` | 🔴 404 | Called by `useVersionCheck.ts` every 5 min |
| `GET /menu/items?featured=true` | 🟡 0 items | Data issue — no featured items seeded |

---

## 5. Recommended Action Plan

### Immediate (today)
1. **Fix `checkNotifications`** — replace `/content/notifications` with `/notifications/me` or remove entirely
2. **Fix Events back navigation** → `profile`
3. **Fix 13 silent catches** — add `console.error`

### Short-term (this week)
4. **Fix public menu endpoint 500** — add `selectinload` for modifier groups in `public/menu.py`
5. **Seed featured items** — set `is_featured=true` on 3-5 menu items for home page display
6. **Profile menu grouping** — add section headers

### Medium-term (next sprint)
7. **Home quick-actions** — add wallet button to HomeHeader
8. **Cart badge on home** — show cart count in HomeHeader when items > 0
