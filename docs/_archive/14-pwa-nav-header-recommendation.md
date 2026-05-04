# PWA Navigation & Header Recommendation

> Date: 2026-04-22 | Based on best-practices research + leading app patterns

## Research Summary

### What leading food/loyalty apps do

| App | Bottom Tabs | Notes |
|-----|-------------|-------|
| **Starbucks** | Home · Order · Scan · Gift · Account | "Order" = browse menu + cart flow. No dedicated Cart tab. |
| **McDonald's** | Home · Order · Deals · Rewards · More | "Order" = menu + cart. "More" = profile/settings/orders. |
| **Domino's** | Home · Order · Tracker · Deals · More | "Tracker" = active orders. "More" = history + profile. |
| **Grab (food)** | Home · Order · Activity · Rewards · Account | "Activity" = orders + notifications. |
| **ZUS Coffee** | Home · Menu · Cart · Orders · Profile | Local competitor. Has Cart tab. |
| **Foodpanda** | Home · Browse · Cart · Orders · Account | Has Cart tab. |

### UX Best Practices (2025)
- **3–5 tabs max** — more causes cognitive overload
- **Odd numbers** (3 or 5) create better visual balance
- **Cart as a tab is debated** — transient state vs. destination. Starbucks/McDonald's avoid it. Foodpanda/ZUS include it.
- **Profile in tab bar** — standard for loyalty apps where users check points/wallet frequently
- **Store context** must be visible on every page (affects menu, cart, pickup ETA)

---

## My Recommendation

### Bottom Navigation: Home | Menu | Rewards | Orders | Profile

| Tab | Icon | Rationale |
|-----|------|-----------|
| **Home** | `Home` | Discovery, featured items, promo banners, wallet snapshot |
| **Menu** | `Coffee` | Full menu browse, categories, search |
| **Rewards** | `Crown` | Browse rewards, tier progress, points balance |
| **Orders** | `Clock` | Order history + active order tracking |
| **Profile** | `User` | Wallet, saved addresses, settings, help, logout |

### Why remove Cart as a tab?

1. **Cart is a transient state, not a destination** — Starbucks, McDonald's, Domino's all treat cart as part of the Order flow, not a tab
2. **5 tabs is the maximum** — adding Profile means something must go. Cart is the least "destination-like"
3. **Cart is still one tap away** — floating cart bar appears on Menu/Home when items exist. Header cart icon on relevant pages
4. **Frees mental model** — "Orders" (history) and "Cart" (current) are easily confused by users

### Where Cart lives instead

```
Menu Page          Home Page           Any Hub Page
┌──────────┐      ┌──────────┐        ┌──────────┐
│  [Menu]  │      │  [Home]  │        │ [Header] │
│          │      │          │        │     🛒3  │ ← cart icon in header
│  Items   │      │ Featured │        │          │
│          │      │          │        │          │
│      ┌───┴───┐  │   ┌───┴───┐      │          │
│      │ 🛒 3  │  │   │ 🛒 3  │      │          │
│      │RM24.50│  │   │RM24.50│      │          │
│      │Checkout│  │   │Checkout│     │          │
│      └───────┘  │   └───────┘      │          │
└──────────┘      └──────────┘        └──────────┘
   ↑ floating cart bar (already exists)
```

---

### Header Pattern: Consistent across all 5 hub pages

Every hub page gets the same header structure with page-specific left content:

```
┌─────────────────────────────────────────────────┐
│ [Left Content]          [Store Pill] [🔔] [⚙️] │
└─────────────────────────────────────────────────┘
```

| Page | Left Content | Right Actions |
|------|-------------|---------------|
| **Home** | "Good morning, **ALEX**" + tier chip | Store pill · Notification bell |
| **Menu** | "Menu" | Search icon · Store pill · Notification bell |
| **Rewards** | "Rewards" + points | Store pill · Notification bell |
| **Orders** | "Orders" | Refresh icon · Store pill · Notification bell |
| **Profile** | "Profile" | Store pill · Notification bell · Settings gear |

**Store pill** = mandatory on every page. Users must always know which store context they're in.

**Notification bell** = global. Tapping goes to Notifications sub-page.

---

### What happens to current DashboardHeader buttons

| Old Button | New Location | Reason |
|-----------|-------------|--------|
| QR Scan | **Floating action button** on Menu page | Contextual to ordering. Only relevant when about to order. |
| Notifications | **Bell icon** in header of all pages | Global feature. Should be reachable from any tab. |
| Switch Store | **Store pill** in header of all pages | Affects menu, cart, pickup ETA on every page. |
| Profile | **Profile tab** in bottom nav | Destination-level feature deserves tab status. |

---

### Sub-page mapping (no bottom nav, back button header)

| Page | Parent | Layout | Back goes to |
|------|--------|--------|-------------|
| Cart | Menu / Home | `ActionLayout` | Previous page |
| Checkout | Cart | `ActionLayout` | Cart |
| Order Detail | Orders | `DetailLayout` | Orders |
| Wallet | Profile | `DetailLayout` | Profile |
| History | Profile | `DetailLayout` | Profile |
| Promotions | Home | `DetailLayout` | Home |
| Information | Home | `DetailLayout` | Home |
| My Rewards | Profile | `DetailLayout` | Profile |
| Account Details | Profile | `DetailLayout` | Profile |
| Payment Methods | Profile | `DetailLayout` | Profile |
| Saved Addresses | Profile | `DetailLayout` | Profile |
| Notifications | Any | `DetailLayout` | Previous page |
| Help & Support | Profile | `DetailLayout` | Profile |

---

### Visual comparison: Before vs After

**Before (Current)**
```
┌────────────────────────────────────────┐
│ Good morning,         [QR] [🔔]        │
│ ALEXANDER         [Store] [👤]         │  ← 130px tall
│ ⭐ Gold · 📍Store ▼                    │
├────────────────────────────────────────┤
│ [Content...]                           │
│                                        │
│                                        │
├────────────────────────────────────────┤
│ 🏠  ☕  👑  🛒  🕐                     │
└────────────────────────────────────────┘
```

**After (Recommended)**
```
┌────────────────────────────────────────┐
│ Good morning, Alex    📍Store ▼  🔔    │  ← 64px tall
│ ⭐ Gold Tier                           │
├────────────────────────────────────────┤
│ [Wallet card promoted to top]          │
│ [Promo banners]                        │
│ [Featured items]                       │
│ [Information cards]                    │
│ [Account settings card]                │
│                                        │
├────────────────────────────────────────┤
│ 🏠  ☕  👑  🕐  👤                     │
└────────────────────────────────────────┘
```

**Space saved**: ~66px on Home = room for wallet card above the fold.

---

## Implementation Notes

### Files already created (in `customer-app/src/components/ui/`)
- `HubHeader.tsx` — contextual header with 5 variants
- `StorePill.tsx` — compact store selector
- `TierBadge.tsx` — tier chip
- `NotificationBell.tsx` — bell with unread dot
- `ScanFAB.tsx` — floating QR scan button

### Next steps to apply this recommendation
1. Update `BottomNav.tsx` — replace Cart tab with Profile tab
2. Update `AppShell.tsx` — pass HubHeader to each hub page, remove inline DashboardHeader
3. Wire Profile page as a hub page (currently a sub-page)
4. Make Cart a sub-page accessible via floating bar + header icon
5. Add account/settings card to bottom of Home page
