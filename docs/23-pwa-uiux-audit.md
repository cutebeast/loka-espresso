# PWA UI/UX Audit — Session 4

> Audited: 2026-04-26 | Loka Espresso Customer PWA | 38 CSS files | Zero Tailwind

## Overview

A comprehensive UI/UX deep dive of the customer PWA covering accessibility, branding, error handling, visual hierarchy, and usability. The audit found 17 UX issues across 4 priority levels.

---

## Strengths

The PWA excels in several areas:

- **Animation quality**: Framer Motion springs, staggered children, scale feedback on tap
- **Color system**: Single source of truth (`tokens.ts` + `variables.css`), consistent var() usage
- **PWA setup**: Comprehensive manifest, SW with background sync, offline.html, A2HS prompt
- **Empty states**: Well-designed across all pages (Cart, Orders, Menu search, Promotions)
- **Portrait lock**: Creative animation with phone rotation hint
- **Guest vs Logged-in**: Clearly differentiated (nav tabs, wallet card, sign-in CTAs)
- **Dine-in flow cohesion**: Table number prominent, "Scan QR" CTA clear, logical payment flow
- **Error handling**: Most places have toast feedback with server messages
- **Accessibility**: `:focus-visible` outline, `role="status"` on OfflineBanner, `aria-live="polite"`
- **Touch feedback**: Scale-down animation on press (`.active:scale-[0.97]`)

---

## Critical Issues

### UX-1: ServiceWorker Update Notification Missing
`sw-update-available` event dispatched but AppShell never listened. Users never prompted to refresh for new version.

**Fix**: Added event listener in AppShell with a toast/banner prompting refresh.

### UX-2: No Hero/Brand Section on HomePage
HomePage opened directly with WalletCard — no logo, no tagline "Artisan Coffee · Community · Culture", no brand identity visible on the most-visited screen.

**Fix**: Added hero section with coffee icon, "Loka Espresso" title, tagline, and welcome message for logged-in users.

### UX-3: Fake Hardcoded Rating "4.8★"
Hardcoded star rating in ItemCustomizeSheet with no actual rating system connected.

**Fix**: Removed the misleading rating display.

---

## High Priority Issues

### UX-4: Touch Targets Under 44px (WCAG 2.5.5)
- Menu "Add" buttons: 32px circle → **updated to min 44px**
- Category tabs: 36px → **updated to min 44px**
- Bottom nav items: undersized → **updated to min 48px**

### UX-5: Menu Load Failure Silent
`loadMenu()` caught errors silently — set empty arrays, no toast, no retry. User saw "No items available" — indistinguishable from genuinely empty menu.

**Fix**: Added error toast ("Failed to load menu. Check your connection.") and Retry button on failure state.

### UX-6: No Loyalty Tier Display
WalletCard showed points + copper badge, but no tier name ("Silver Member"), no progress bar toward next tier.

**Fix**: Added tier badge ("Bronze Member", etc.) below the points display in WalletCard.

### UX-7: Dead Components
- `CategoryNav.tsx`: 91 lines, has its own implementation but MenuPage uses inline category bar.
- `PaymentSummary.tsx`: 44 lines, imported but never rendered — summary is inline in CheckoutPage.

**Fix**: Removed both files.

---

## Medium Priority Issues

### UX-8: No Saved Addresses Integration
Users re-entered delivery address every time.

**Fix**: Added "Use a saved address" dropdown to DeliveryAddressCard, fetching saved addresses from `/me/addresses`.

### UX-9: No Date Selection for Pickup
Only same-day slots. If store closes within 2 hours, no slots appeared — no fallback to tomorrow.

**Fix**: Added date navigation (prev/next day) to TimeSlotPicker with labeled "Today"/"Tomorrow" display.

### UX-10: Bottom Nav Lacks Badge Counts
Cart count shown on FloatingCartBar only. No badge on nav Menu/Orders tabs.

**Fix**: Added cart item count badge to the Menu nav tab.

### UX-11: Voucher/Reward Discount Parsing Fragile
`JSON.parse()` in try/catch with fallback to 0. Multiple inline JSON.parse calls.

**Fix**: Extracted `parseRewardSnapshot()` helper with proper type checking.

### UX-12: `sub-components.css` at 840 Lines
Covers too many unrelated components (TypePill, VoucherReveal, RedemptionCode, TermsList, TspPicker).

**Status**: Partially addressed — some sub-components already split to dedicated files. Full split deferred.

---

## Low Priority Issues

### UX-13: No Persistent Polling Indicator on OrdersPage
"Auto-updating..." text or pulsing dot missing from orders list during polling.

### UX-14: Cream Color (`#F3EEE5`) Underutilized
Could add warmth to cards, sheets, backgrounds.

### UX-15: Brown Accent (`#57280D`) Underutilized
Only in DineInTableCard text and ItemCard coffee icon.

### UX-16: Dine-in Pill Disabled State Unclear
No tooltip explaining "Scan table QR to enable".

### UX-17: "Send to Kitchen" Button
Looks identical to "Place Order" — could have distinct visual treatment (kitchen icon, darker color).

---

## Resolution Summary

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| UX-1 | SW update notification | Critical | ✅ Fixed |
| UX-2 | Hero/brand section | Critical | ✅ Fixed |
| UX-3 | Fake 4.8★ rating | Critical | ✅ Fixed |
| UX-4 | Touch targets < 44px | High | ✅ Fixed |
| UX-5 | Menu load failure silent | High | ✅ Fixed |
| UX-6 | No loyalty tier display | High | ✅ Fixed |
| UX-7 | Dead components | High | ✅ Fixed |
| UX-8 | Saved addresses missing | Medium | ✅ Fixed |
| UX-9 | No date picker | Medium | ✅ Fixed |
| UX-10 | Nav badge counts | Medium | ✅ Fixed |
| UX-11 | Voucher parsing fragile | Medium | ✅ Fixed |
| UX-12 | sub-components.css | Medium | ⚠️ Partial |
| UX-13 | Polling indicator | Low | Deferred |
| UX-14 | Cream color usage | Low | Deferred |
| UX-15 | Brown accent usage | Low | Deferred |
| UX-16 | Dine-in pill tooltip | Low | Deferred |
| UX-17 | Kitchen button treatment | Low | Deferred |
