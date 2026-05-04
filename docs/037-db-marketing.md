# Database Schema — Vouchers, Promos, Surveys

> Part of [02-database-schema.md](02-database-schema.md)

Voucher catalog and per-customer instances, in-app promo banners, survey forms with questions and responses.

---

## Tables

### `vouchers`
Voucher **catalog** (company-wide). Admin creates templates; `user_vouchers` holds per-customer instances. Supports soft delete.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| code | varchar(50) | NO | | Unique catalog code (e.g. WELCOME10) |
| title | varchar(255) | YES | | Marketing display title |
| description | varchar(500) | YES | | Internal description |
| discount_type | discounttype | NO | | `percent`, `fixed`, `free_item` |
| discount_value | numeric(10,2) | NO | | Discount amount/percentage |
| min_spend | numeric(10,2) | NO | 0 | Minimum spend required |
| max_uses | integer | YES | | Total global use limit |
| max_uses_per_user | integer | YES | 1 | Per-customer claim limit |
| used_count | integer | YES | 0 | Current global use count |
| valid_from | timestamptz | YES | | Start date |
| valid_until | timestamptz | YES | | End date |
| image_url | varchar(500) | YES | | Banner image |
| body | text | YES | | Marketing body text |
| promo_type | varchar(50) | YES | | Campaign classification |
| store_id | integer | YES | | FK→stores.id (null=all stores) |
| terms | json | YES | | Terms list |
| how_to_redeem | text | YES | | Instructions |
| short_description | varchar(500) | YES | | PWA card subtitle |
| long_description | text | YES | | PWA detail page |
| validity_days | integer | YES | 30 | Days until instance expires after claim |
| is_active | boolean | NO | true | |
| deleted_at | timestamptz | YES | | Soft delete |
| created_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id)
**Unique:** code

### `user_vouchers`
Per-customer voucher **instances**. One row per claim. Catalog→Instance pattern.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| voucher_id | integer | NO | | FK→vouchers.id |
| store_id | integer | YES | | FK→stores.id |
| applied_at | timestamptz | YES | now() | When first created |
| order_id | integer | YES | | FK→orders.id |
| source | varchar(30) | YES | | Origin: `survey`, `promo_detail`, `admin_grant`, `loyalty` |
| source_id | integer | YES | | FK to originating entity (survey_response.id, etc.) |
| status | varchar(20) | YES | 'available' | `available`, `used`, `expired` |
| code | varchar(50) | YES | | Unique per-instance code (e.g. WELCOME10-A3F2B1) |
| expires_at | timestamptz | YES | | Per-instance expiry |
| used_at | timestamptz | YES | | When applied at checkout |
| discount_type | varchar(20) | YES | | Snapshotted from catalog at claim time |
| discount_value | numeric(10,2) | YES | | Snapshotted from catalog at claim time |
| min_spend | numeric(10,2) | YES | | Snapshotted from catalog at claim time |

**Indexes:** PK(id), UNIQUE(code), ix_user_vouchers_user_id
**FKs:** user_id → users(id), voucher_id → vouchers(id), store_id → stores(id), order_id → orders(id)

### `information_cards`
Pure content/announcement cards for PWA home. No claim action - just display content.
Unlike promo_banners, these have no voucher/survey action.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Card headline |
| slug | varchar(255) | YES | | URL-friendly slug for deep-linking |
| short_description | varchar(500) | YES | | Card preview text (PWA listing) |
| long_description | text | YES | | Full content (detail view) |
| icon | varchar(50) | YES | | Lucide icon name (e.g., "coffee", "info") |
| image_url | varchar(500) | YES | | Card thumbnail image |
| gallery_urls | json | YES | | Product gallery image URLs |
| store_id | integer | YES | | FK→stores.id (null=all stores) |
| start_date | timestamptz | YES | | Visibility start |
| end_date | timestamptz | YES | | Visibility end |
| is_active | boolean | NO | true | |
| position | integer | YES | 0 | Display order |
| content_type | varchar(20) | NO | 'information' | `information`, `product`, `promotion`, `system` |
| action_url | varchar(500) | YES | | CTA target URL (promotion popups only) |
| action_type | varchar(20) | YES | | CTA behavior type |
| action_label | varchar(100) | YES | | CTA button label |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id)
**Constraints:** `ck_info_card_content_type` ensures valid content_type values

**Content Types:**
| Type | Purpose | PWA Display |
|------|---------|-------------|
| `information` | General articles, stories, reads (coffee culture, food stories) | Home page info cards, Information page listing |
| `product` | Product-specific info (coffee machine specs, bean origins) | Accessed via QR code scan (`?slug={slug}`) |
| `promotion` | Promotional image popups | Full-screen image popup on PWA homepage (once per promotion) |
| `system` | Legal/policy content (T&C, Privacy Policy) | Accessed via `/content/legal/terms` and `/content/legal/privacy` |

**Promotion Popup Behavior:**
- Image-only fullscreen popup on PWA homepage
- Fetches the latest active `content_type='promotion'` card
- Shows immediately (no delay) when user lands on home
- Dismissed promotion IDs are stored in IndexedDB — never shown again
- Optional CTA button at bottom if `action_url` is set

**System Content (Seeded):**
| Title | content_type | Purpose |
|-------|--------------|---------|
| Terms & Conditions | system | Legal T&C text |
| Privacy Policy | system | Privacy policy text |
| ☕ Turkish Coffee Reading | promotion | Feature highlight |

**API:**
- PWA: `GET /content/information` - List active promotional cards (excludes system by default)
- PWA: `GET /content/information?include_system=true` - Include system content
- PWA: `GET /content/legal/terms` - Get Terms & Conditions
- PWA: `GET /content/legal/privacy` - Get Privacy Policy
- Admin: `GET/POST/PUT/DELETE /admin/content/cards` - Full CRUD

---

### `promo_banners`
In-app promotional banners with **claimable action**. Displayed on customer PWA home.

**Action types:**
- `detail` → Show info + "Claim" button (links to voucher)
- `survey` → Open survey, auto-reward on completion

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Banner headline |
| short_description | varchar(255) | YES | | Card subtitle |
| image_url | varchar(500) | YES | | Banner image |
| position | integer | YES | 0 | Display order |
| store_id | integer | YES | | FK→stores.id (null=all) |
| start_date | timestamptz | YES | | Campaign start |
| end_date | timestamptz | YES | | Campaign end |
| action_type | varchar(20) | YES | 'detail' | `detail` (show info) or `survey` (open survey) |
| voucher_id | integer | YES | | FK→vouchers.id (voucher to offer on detail tap) |
| survey_id | integer | YES | | FK→surveys.id (survey to show on survey tap) |
| long_description | text | YES | | Full detail page content |
| terms | json | YES | | Terms list |
| how_to_redeem | text | YES | | Instructions |
| is_active | boolean | NO | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id), voucher_id → vouchers(id), survey_id → surveys(id)

### `surveys`
Survey forms for customer feedback/marketing. Company-wide.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Survey title |
| description | text | YES | | Survey description |
| reward_voucher_id | integer | YES | | FK→vouchers.id (auto-grant on completion) |
| is_active | boolean | NO | true | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** reward_voucher_id → vouchers(id)

### `survey_questions`
Questions within a survey. Max 5 per survey. Types: text, single_choice, rating, dropdown.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| survey_id | integer | NO | | FK→surveys.id (CASCADE) |
| question_text | text | NO | | The question |
| question_type | varchar(20) | NO | 'text' | `text`, `single_choice`, `rating`, `dropdown` |
| options | json | YES | | Options for choice/dropdown types |
| is_required | boolean | NO | true | |
| sort_order | integer | NO | 0 | |
| created_at | timestamptz | YES | now() | |

**FKs:** survey_id → surveys(id) ON DELETE CASCADE

### `survey_responses`
Customer responses to surveys. One per customer per survey (duplicate guard).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| survey_id | integer | NO | | FK→surveys.id (CASCADE) |
| user_id | integer | YES | | FK→users.id |
| rewarded | boolean | NO | false | Whether voucher was granted |
| created_at | timestamptz | YES | now() | |

**FKs:** survey_id → surveys(id) ON DELETE CASCADE, user_id → users(id)

### `survey_answers`
Individual answers within a survey response.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| response_id | integer | NO | | FK→survey_responses.id (CASCADE) |
| question_id | integer | NO | | FK→survey_questions.id (CASCADE) |
| answer_text | text | YES | | The answer |
| created_at | timestamptz | YES | now() | |

**FKs:** response_id → survey_responses(id) ON DELETE CASCADE, question_id → survey_questions(id) ON DELETE CASCADE

---

## Seeded Data

> Last updated: 2026-04-16 — seed steps 06-08 verified

| Entity | Count | Source Script | Details |
|--------|-------|---------------|---------|
| Rewards | 8 | `seed_06_rewards.py` | 6 active (free_item, discount_voucher, custom) + 2 inactive |
| Checkout Vouchers | 5 | `seed_07_vouchers.py` | WELCOME10, SAVE5RM, FREECOFFEE (future) + EXPIRED20, OLDSAVE (past) |
| Survey Reward Vouchers | 3 | `seed_08_promotions.py` | SURVEY-REWARD-5, SURVEY-REWARD-10PCT, SURVEY-REWARD-COFFEE |
| Surveys | 3 | `seed_08_promotions.py` | Customer Satisfaction (4Q), New Menu Feedback (3Q), Store Experience (3Q) |
| Survey Questions | 10 | `seed_08_promotions.py` | 4 + 3 + 3 across 3 surveys |
| Promo Banners | 5 | `seed_08_promotions.py` | 3 active (survey action) + 2 expired (detail action) |

### Voucher Codes (seed_07)

| Code | Type | Value | Min Spend | Valid Until | Active |
|------|------|-------|-----------|-------------|--------|
| WELCOME10 | percent | 10% | RM25 | 2027-01-01 | ✅ |
| SAVE5RM | fixed | RM5 | RM20 | 2027-06-30 | ✅ |
| FREECOFFEE | free_item | up to RM15 | RM30 | 2027-03-15 | ✅ |
| EXPIRED20 | percent | 20% | RM15 | 2025-01-01 | ✅ (expired) |
| OLDSAVE | fixed | RM8 | RM25 | 2025-06-01 | ✅ (expired) |

### Survey Reward Vouchers (seed_08)

| Code | Type | Value | Min Spend | Valid Until | Active |
|------|------|-------|-----------|-------------|--------|
| SURVEY-REWARD-5 | fixed | RM5 | — | 2028-12-31 | ✅ |
| SURVEY-REWARD-10PCT | percent | 10% | — | 2028-12-31 | ✅ |
| SURVEY-REWARD-COFFEE | free_item | up to RM15 | — | 2028-12-31 | ✅ |

### Reward Codes (seed_06)

| Code | Type | Points | Min Spend | Active |
|------|------|--------|-----------|--------|
| RWD-FREE-LATTE | free_item | 150 | — | ✅ |
| RWD-FREE-CROISSANT | free_item | 120 | — | ✅ |
| RWD-FREE-TIRAMISU | free_item | 200 | — | ✅ |
| RWD-FREE-TUMBLER | free_item | 500 | — | ✅ |
| RWD-5OFF | discount_voucher | 100 | RM15 | ✅ |
| RWD-MYSTERY | custom | 250 | — | ✅ |
| RWD-FREE-AMERICANO | free_item | 80 | — | ❌ inactive |
| RWD-10OFF | discount_voucher | 300 | RM20 | ❌ inactive |
