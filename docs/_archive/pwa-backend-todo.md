# PWA Backend Status

> Created: 2026-04-20
> Last updated: 2026-04-20

---

## ✅ COMPLETED - All Backend Work Done

### 1. Model Reorganization

Split `admin_extras.py` into domain-specific files:

```
models/
├── content.py              # InformationCard
├── promotions.py           # PromoBanner
├── feedback.py             # Feedback
├── audit.py                # AuditLog
├── notifications.py        # Notification, NotificationBroadcast
└── [existing files]
```

**Updated imports in:**
- `models/__init__.py`
- `api/v1/endpoints/admin/admin_system.py`
- `api/v1/endpoints/admin/admin_feedback.py`
- `api/v1/endpoints/admin/reports.py`
- `api/v1/endpoints/pwa/pwa_promos.py`
- `api/v1/endpoints/pwa/pwa_content.py` (new)
- `api/v1/endpoints/admin/admin_content.py` (new)
- `core/audit.py`

### 2. Information Cards Backend

**Model:** `content.py` - `InformationCard`

**Database:**
- Migration: `alembic/versions/add_information_cards.py`
- Table created: `information_cards`

**Admin API:** `admin_content.py`
- `GET /admin/content/cards` - List with pagination
- `POST /admin/content/cards` - Create
- `GET /admin/content/cards/{id}` - Detail
- `PUT /admin/content/cards/{id}` - Update
- `DELETE /admin/content/cards/{id}` - Delete

**PWA API:** `pwa_content.py`
- `GET /content/information` - Active cards (public)

### 3. Admin Frontend - Information Page

**File:** `frontend/src/components/pages/marketing/InformationPage.tsx`

Features:
- List view with pagination
- Create/Edit drawer form
- **Image upload** via `/api/v1/upload/marketing-image`
- Fields: title, icon, short/long description, image, action_url, dates, is_active
- Toggle active/inactive
- Delete with confirmation
- Shows image thumbnail or icon fallback in table

**Sidebar:** Added "Information" menu item under CRM & Marketing

### 4. PWA Frontend - Image Display

**File:** `customer-app/src/components/HomePage.tsx`

- **Promo Banners:** Display uploaded image at top of card (128px height), fallback to text-only if no image
- **Information Cards:** Display circular image (56px) or icon fallback
- Images loaded from: `https://admin.loyaltysystem.uk/uploads/marketing/{filename}`
- Error handling: Images that fail to load are hidden

### 5. Image Upload & Serving

**Upload Endpoint:** `POST /api/v1/upload/marketing-image`
- Max size: 5MB
- Allowed: JPEG, PNG, WebP, GIF
- Saved to: `/root/fnb-super-app/uploads/marketing/`
- Returns: `{ url: "/uploads/marketing/{filename}" }`

**Static Files:**
- Backend mounts `/uploads` → `StaticFiles(directory=UPLOAD_DIR)`
- Accessible via: `https://admin.loyaltysystem.uk/uploads/{folder}/{filename}`
- Also accessible via PWA domain: `https://app.loyaltysystem.uk/uploads/{folder}/{filename}`

**Verified Working:**
```bash
# Test image URL
curl -I https://admin.loyaltysystem.uk/uploads/marketing/bd86ba4c688847c7944ea5115a2bcdbd.jpeg
# HTTP/2 200 ✅
```

### 6. API Documentation Updated

**`docs/03-api-reference.md`:**
- Added PWA Content section
- Added Admin Content section
- Updated endpoint count: 210
- Last updated: 2026-04-20

**`docs/02g-marketing.md`:**
- Added `information_cards` table schema
- Clarified difference between `promo_banners` (action) and `information_cards` (content)

### 7. Manage Script Cleanup

- Removed broken `seed` and `seed_loyalty` commands
- `/root/fnb-manage.sh` is now symlink to `/root/fnb-super-app/scripts/fnb-manage.sh`
- Single source of truth
- Removed old SQL files:
  - `/root/reseed.sql`
  - `/root/seed-loyalty-full.sql`
  - `/root/fnb-super-app/backend/seeds/*.sql`

---

## API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/content/information` | GET | Public | Active info cards for PWA |
| `/admin/content/cards` | GET | Admin | List cards (paginated) |
| `/admin/content/cards` | POST | Admin | Create card |
| `/admin/content/cards/{id}` | GET | Admin | Card detail |
| `/admin/content/cards/{id}` | PUT | Admin | Update card |
| `/admin/content/cards/{id}` | DELETE | Admin | Delete card |
| `/promos/banners` | GET | Public | Active promo banners |
| `/promos/banners/{id}/claim` | POST | Customer | Claim voucher |
| `/upload/marketing-image` | POST | Admin | Upload image (5MB max) |

---

## Domain Logic

### Information Card (Pure Content)
- No claim action
- **Image upload supported** - shows on PWA card
- Short description = card preview
- Long description = detail view
- Optional icon, image, action_url
- Hidden on PWA when no active cards

### Promo Banner (With Action)
- `action_type='detail'` → Claim voucher
- `action_type='survey'` → Complete survey, auto-reward
- **Image upload supported** - shows at top of card
- Short description = card preview
- Long description = detail view + terms + how_to_redeem

### Reward (Loyalty)
- Redeemed with loyalty points
- Sticks to user until used/expired

### Voucher (Promotion)
- Claimed from promo banners
- Sticks to user until used/expired

---

## Image Flow

```
Admin Upload
    ↓
POST /upload/marketing-image
    ↓
Saved to: /root/fnb-super-app/uploads/marketing/{uuid}.jpeg
    ↓
URL stored: /uploads/marketing/{uuid}.jpeg
    ↓
PWA Display
    ↓
<img src="https://admin.loyaltysystem.uk/uploads/marketing/{uuid}.jpeg">
```

---

## Verified Working

```bash
# PWA Content API
curl https://admin.loyaltysystem.uk/api/v1/content/information
# → []

# Promo Banners API
curl https://admin.loyaltysystem.uk/api/v1/promos/banners
# → [{id, title, short_description, image_url, action_type, ...}]

# Image Access (both domains work)
curl -I https://admin.loyaltysystem.uk/uploads/marketing/bd86ba4c688847c7944ea5115a2bcdbd.jpeg
# → HTTP/2 200 ✅

curl -I https://app.loyaltysystem.uk/uploads/marketing/bd86ba4c688847c7944ea5115a2bcdbd.jpeg  
# → HTTP/2 200 ✅
```

---

## Seeding

All seeding must use Python API scripts:
```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_seed_XX_*.py
```

Direct SQL insertion is **prohibited** to ensure:
- API validation
- Proper relationships
- Business rule enforcement
