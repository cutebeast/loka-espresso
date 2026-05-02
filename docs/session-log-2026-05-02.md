# Session Log — 2026-05-02

> UI/UX v2 Phase 1: Saved Addresses, Checkout Address Sheet, Store Persistence, IP Geolocation

## DB Schema Changes

### customer_addresses table — new columns
- `apartment` (VARCHAR 100, nullable) — Unit/Apartment No.
- `delivery_instructions` (VARCHAR 300, nullable) — Delivery notes
- `city` (VARCHAR 100, nullable) — City
- `postcode` (VARCHAR 10, nullable) — Postcode
- `state` (VARCHAR 50, nullable) — Malaysian state
- `building` (VARCHAR 100, nullable) — Address Line 2 (building/taman)

Migrations:
- `1d7ce9c8cb6c` — add apartment, delivery_instructions
- `50327a33c253` — add city, postcode, state
- `d4e5f6a7b8c9` — add building (Address Line 2)

### cart_items schema — added store_id
- `CartItemCreate` Pydantic schema now accepts `store_id: Optional[int]`
- Backend `add_to_cart` sets `store_id` from request

### MaxMind GeoLite2 Integration
- `maxminddb` Python package added
- GeoLite2-City.mmdb (65MB) downloaded at Docker build time via MaxMind API
- Credentials in `.env`: `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`
- Backend endpoint: `GET /content/location` — resolves client IP → lat/lng

## Frontend Changes

### Saved Addresses Page (`#saved-addresses`)
- **CSS**: `saved-addresses-v2.css` — self-contained, all `.sav2-*` classes
- **Cards**: Map pin icons, multi-line address display (white-space: pre-line), distance badges
- **Ordering**: Always Home → Office → Other
- **Max 3 per user**: 1 per label. Add: auto-select first available label, blocks used labels. Edit: label locked.
- **BottomSheet**: Swipe-to-close via `BottomSheet` component (drag="y")
- **Form**: Malaysian address format — Unit/Apt, Line 1, Line 2, City, Postcode, State
- DB columns used separately: `apartment`, `address`, `building`, `city`, `postcode`, `state`

### Checkout Address Sheet (`DeliveryAddressCard`)
- **BottomSheet** with swipe-to-close, label pills, Malaysian format fields
- **Auto-fill**: Label switches pull from address book DB (city/postcode/state/building)
- **Upsert**: Same label saves over existing (PUT if exists, POST if new)
- Name/phone fields lifted to CheckoutPage (default from profile, survive refresh via checkoutDraft)
- Multi-line display with `white-space: pre-line`

### Checkout Page (`#checkout`)
- Order items: real thumbnails (44x44), customization tags matching cart style (#F2F6EA, 10px pill)
- Payment methods: Wallet, Pay at Store, COD + greyed out Visa/DuitNow/TNG with "Coming soon"
- Voucher & Rewards: grey card with `>` chevron opens BottomSheet
- Order Notes: always visible, grey bg from cart
- Dine-in: disabled pill with QR toast "Ask service crew for QR code"
- Sticky footer with cart-style totals

### Store Persistence
- `uiStore` changed from localStorage to `idbStorage` (IndexedDB) — matches cartStore
- Key: `ui-store-v2` (versioned to avoid stale data conflicts)
- `partialize` includes: `selectedStore`, `orderMode`, `dineInSession`, `checkoutDraft`, `previousPage`

### Cart Sync Fix
- `POST /cart/items` now includes `store_id` from selected store
- Backend `CartItemCreate` schema accepts `store_id`

### IP Geolocation Replacement
- Frontend `detectIPLocation()` now calls backend `GET /content/location` (MaxMind) instead of ip-api.com
- Backend has ip-api fallback (second attempt)
- Kuala Lumpur default (3.139, 101.687) as final fallback

### Backend Fix
- `list_addresses` endpoint: changed from lazy-load (hasattr) to explicit `select(CustomerAddress)` query to fix async MissingGreenlet error

## Files Affected

| File | Change |
|---|---|
| `backend/app/models/customer.py` | Added apartment, building, city, postcode, state, delivery_instructions |
| `backend/app/schemas/user.py` | Updated AddressCreate/Update/Out with new fields |
| `backend/app/schemas/cart.py` | Added store_id to CartItemCreate |
| `backend/app/api/v1/endpoints/pwa/cart.py` | Cart item creation uses store_id |
| `backend/app/api/v1/endpoints/common/users.py` | Fixed async list_addresses query |
| `backend/app/api/v1/endpoints/pwa/pwa_content.py` | Added GET /content/location with MaxMind |
| `backend/requirements.txt` | Added maxminddb |
| `backend/Dockerfile` | Added GeoLite2 download step |
| `.env` | Added MAXMIND credentials |
| `customer-app/src/stores/uiStore.ts` | Changed to idbStorage, added partialize fields |
| `customer-app/src/lib/cartSync.ts` | Added store_id to cart item POST |
| `customer-app/src/lib/geolocation.ts` | detectIPLocation now uses backend endpoint |
| `customer-app/src/components/profile/SavedAddressesPage.tsx` | Full v2 rewrite |
| `customer-app/src/components/checkout/DeliveryAddressCard.tsx` | BottomSheet, auto-fill, Malaysian format |
| `customer-app/src/components/CheckoutPage.tsx` | Reconstructed with all v2 features |
| `customer-app/src/styles/saved-addresses-v2.css` | Self-contained v2 CSS |
| `customer-app/src/styles/delivery-address.css` | Updated with sheet/textarea styles |
| `customer-app/src/styles/checkout-v2.css` | Order items, payment, voucher, notes styles |
