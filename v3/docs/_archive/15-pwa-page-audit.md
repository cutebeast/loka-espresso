# PWA Page Audit & Rework Plan

> Date: 2026-04-22 | Target: unified components, zero inline styles

---

## All PWA Pages

### Auth Flow (pre-login)
| # | Page | File | Layout | Inline Styles | Local LOKA | Status |
|---|------|------|--------|---------------|------------|--------|
| 1 | Splash Screen | `auth/SplashScreen.tsx` | ImmersiveLayout | 10 | 0 | 🔲 |
| 2 | Phone Input | `auth/PhoneInput.tsx` | WizardLayout | 23 | 1 | 🔲 |
| 3 | OTP Input | `auth/OTPInput.tsx` | WizardLayout | 22 | 1 | 🔲 |
| 4 | Profile Setup | `auth/ProfileSetup.tsx` | WizardLayout | 14 | 0 | 🔲 |

### Hub Pages (with bottom nav)
| # | Page | File | Layout | Inline Styles | Local LOKA | Status |
|---|------|------|--------|---------------|------------|--------|
| 5 | Home / Dashboard | `HomePage.tsx` | HubLayout | 75 | 0 | 🔲 |
| 6 | Menu | `MenuPage.tsx` | HubLayout | 22 | 0 | 🔲 |
| 7 | Rewards | `RewardsPage.tsx` | HubLayout | 71 | 1 | 🔲 |
| 8 | Orders | `OrdersPage.tsx` | HubLayout | 0 | 0 | ✅ |
| 9 | Profile | `ProfilePage.tsx` | HubLayout | 46 | 1 | 🔲 |

### Sub-pages (no bottom nav, back button)
| # | Page | File | Layout | Inline Styles | Local LOKA | Status |
|---|------|------|--------|---------------|------------|--------|
| 10 | Cart | `CartPage.tsx` | ActionLayout | 65 | 0 | 🔲 |
| 11 | Checkout | `CheckoutPage.tsx` | ActionLayout | 54 | 1 | 🔲 |
| 12 | Order Detail | `OrdersPage.tsx` (inline) | DetailLayout | 0 | 0 | ✅ |
| 13 | Wallet | `WalletPage.tsx` | DetailLayout | 0 | 0 | ✅ |
| 14 | History | `HistoryPage.tsx` | DetailLayout | 0 | 0 | ✅ |
| 15 | Promotions | `PromotionsPage.tsx` | DetailLayout | 69 | 1 | 🔲 |
| 16 | Information | `InformationPage.tsx` | DetailLayout | 3 | 0 | 🔲 |
| 17 | My Rewards | `MyRewardsPage.tsx` | DetailLayout | 47 | 1 | 🔲 |
| 18 | Notifications | `profile/NotificationsPage.tsx` | DetailLayout | 19 | 1 | 🔲 |
| 19 | Account Details | `profile/AccountDetailsPage.tsx` | DetailLayout | 19 | 1 | 🔲 |
| 20 | Payment Methods | `profile/PaymentMethodsPage.tsx` | DetailLayout | 26 | 1 | 🔲 |
| 21 | Saved Addresses | `profile/SavedAddressesPage.tsx` | DetailLayout | 27 | 1 | 🔲 |
| 22 | Help & Support | `profile/HelpSupportPage.tsx` | DetailLayout | 22 | 1 | 🔲 |

### Modals / Overlays
| # | Component | File | Layout | Inline Styles | Local LOKA | Status |
|---|-----------|------|--------|---------------|------------|--------|
| 23 | QR Scanner | `QRScanner.tsx` | ImmersiveLayout | 5 | 0 | 🔲 |
| 24 | Store Picker | `StorePickerModal.tsx` | BottomSheetLayout | 29 | 0 | 🔲 |
| 25 | Item Customize | `menu/ItemCustomizeSheet.tsx` | BottomSheetLayout | ? | ? | 🔲 |

### Summary
- **Total pages**: 25
- **Already clean** (0 inline styles, 0 local LOKA): Orders, Wallet, History = 3
- **Needs rework**: 22 pages
- **Highest priority** (auth + dashboard): SplashScreen, PhoneInput, OTPInput, ProfileSetup, HomePage = 5 pages

---

## Rework Strategy

### Phase 1: Auth Flow (Splash → Phone → OTP → Profile)
- Wrap in `WizardLayout` with step indicator
- Replace inline styles with CSS classes
- Import LOKA from `@/lib/tokens`
- Use `Button` component from UI primitives

### Phase 2: Home / Dashboard
- Wrap in `HubLayout` with `HubHeader` (home variant)
- Replace inline styles with CSS classes
- Use `SurfaceCard`, `SectionHeader` from UI primitives
- Keep `BottomNav`

### Phase 3: Remaining hub pages (Menu, Rewards, Profile)
- Wrap each in `HubLayout` with appropriate `HubHeader` variant
- Remove inline styles

### Phase 4: Sub-pages
- Migrate each to `DetailLayout` or `ActionLayout`
- Remove inline back buttons
- Remove local LOKA objects

### Phase 5: Modals
- Migrate to `BottomSheetLayout` or `ImmersiveLayout`

---

## CSS Classes Needed (add to globals.css)

### Auth-specific
```css
.loka-auth-container { padding: 56px 24px 32px; }
.loka-auth-brand { width: 56px; height: 56px; border-radius: 18px; background: var(--color-copper-50); border: 1px solid rgba(209,142,56,0.25); }
.loka-auth-title { font-size: 30px; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; color: var(--color-text-primary); }
.loka-auth-subtitle { font-size: 15px; color: var(--color-text-muted); line-height: 1.5; }
.loka-input-wrapper { display: flex; align-items: center; border: 1.5px solid var(--color-border); border-radius: 16px; padding: 4px 16px 4px 14px; background: white; }
.loka-input-wrapper:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 4px rgba(56,75,22,0.08); }
.loka-input { border: none; padding: 16px 0; font-size: 17px; font-weight: 500; width: 100%; outline: none; background: transparent; color: var(--color-text-primary); }
```
