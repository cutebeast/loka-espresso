# Admin State Management Refactor — Final Audit

**Date:** 2026-05-04  
**Result:** ✅ Complete — 0 regressions, 0 errors, net -375 lines  
**TypeScript:** 0 errors | **ESLint:** 0 errors 0 warnings

---

## Summary

| Dimension | Before | After |
|-----------|--------|-------|
| State management | 30+ `useState` in `page.tsx`, 3 hooks | 4 Zustand stores, zero local useState at root |
| Prop drilling | 30+ props → `PageRenderer`, 16 props → `AdminModals` | `AdminModals` 0 props. `PageRenderer` receives individual selectors |
| `token` prop | Passed to 20+ pages | Removed from all pages. `apiFetch` uses cookies internally |
| Old hooks | `useAuth.ts`, `useHashRouter.ts`, `useMerchantData.ts` | Deleted |
| `onRefresh` callbacks | Passed as props to 5 pages | Pages call store fetchers directly |
| Dependency | None | `zustand@5.0.12` |
| Net change | — | **+266 / -641 lines** (net -375) |

---

## New Files (4 stores + 1 barrel)

| File | Replaces | State |
|------|----------|-------|
| `stores/authStore.ts` | `useAuth.ts` | token, role, userType, name, phone, email, logout, fetchUserRole |
| `stores/routerStore.ts` | `useHashRouter.ts` | page, customerDetailId, hashchange/popstate listeners |
| `stores/uiStore.ts` | `page.tsx` local useState | modals, sidebar, collapsedGroups, notifRefreshKey, customizingItem |
| `stores/merchantDataStore.ts` | `useMerchantData.ts` | stores, orders, dashboard, menu, inventory, tables, loyaltyTiers, all fetchers |
| `stores/index.ts` | — | Barrel export |

---

## Deleted Files

| File | Reason |
|------|--------|
| `hooks/useAuth.ts` | Replaced by `authStore` |
| `hooks/useHashRouter.ts` | Replaced by `routerStore` |
| `hooks/useMerchantData.ts` | Replaced by `merchantDataStore` |

---

## Modified Files (30 pages)

Every page had its `token` prop removed. Pages that previously received data as props now consume stores directly:

| Page | Store Consumption |
|------|-------------------|
| **MenuPage** | `useMerchantDataStore` (7 fields), `useAuthStore` (userType), `useUIStore` (setCustomizingItem) |
| **InventoryPage** | `useMerchantDataStore` (5 fields), `useAuthStore` (userType) |
| **StaffPage** | `useMerchantDataStore` (stores, selectedStore, setSelectedStore) |
| **KitchenDisplayPage** | `useAuthStore.getState().token` (reads at call time) |
| **RewardsPage** | None — uses `apiFetch` (cookie-auth). Token prop removed |
| **CustomerDetailPage** | None — uses `apiFetch` (cookie-auth). Token prop removed |
| **InformationPage** | None — uses `apiFetch`. Token prop removed, passed through to upload helpers |
| **VouchersPage** | None — uses `apiFetch`. Token prop removed |
| **All other 22 pages** | Token prop removed. `apiFetch` / `apiUpload` work via cookies |

---

## Remaining Work

| Item | Status |
|------|--------|
| Extract `PageRenderer` to separate file | 🔲 Optional — `page.tsx` still 425 lines |
| Extract `AdminModals` to separate file | 🔲 Optional — clean but cosmetic |
| File-based routing (Next.js pages router) | 🔲 Deferred — major effort |
| Convert remaining 16 pages to store-first | 🔲 Deferred — only needed for pages receiving `stores`/`selectedStore`/`onRefresh` props |
