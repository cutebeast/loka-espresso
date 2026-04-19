# Database Schema — Social & Content

> Part of [02-database-schema.md](02-database-schema.md)

Customer favorites, referral tracking, feedback, push notifications, admin broadcasts, and marketing campaigns.

---

## Tables

### `favorites`
Customer favorite items. GLOBAL.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| item_id | integer | NO | | FK→menu_items.id |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), item_id → menu_items(id)
**Unique:** (user_id, item_id)

### `referrals`
Referral tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| referrer_id | integer | NO | | FK→users.id |
| invitee_id | integer | YES | | FK→users.id |
| code | varchar(50) | NO | | Referral code |
| reward_amount | numeric(10,2) | YES | | Bonus amount |
| created_at | timestamptz | YES | now() | |

**FKs:** referrer_id → users(id), invitee → users(id)
**Unique:** code

### `feedback`
Customer feedback. Company-wide (store_id is optional).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | YES | | FK→users.id |
| store_id | integer | NO | | FK→stores.id |
| order_id | integer | YES | | FK→orders.id |
| rating | integer | NO | | 1-5 stars |
| comment | text | YES | | Text feedback |
| tags | json | YES | | ["slow_service", "great_coffee"] |
| is_resolved | boolean | NO | false | |
| admin_reply | text | YES | | Manager response |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id), store_id → stores(id), order_id → orders(id)

### `notifications`
Push notifications to users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| user_id | integer | NO | | FK→users.id |
| title | varchar(255) | NO | | Notification title |
| body | text | YES | | Notification body |
| type | varchar(50) | YES | | `order`, `promo`, `system` |
| is_read | boolean | NO | false | |
| created_at | timestamptz | YES | now() | |

**FKs:** user_id → users(id)

### `notification_broadcasts`
Admin-sent broadcast notifications.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| title | varchar(255) | NO | | Broadcast title |
| body | text | YES | | Message body |
| status | varchar(20) | YES | 'draft' | Broadcast status (draft/sent) |
| audience | varchar(50) | YES | all | Target: all, loyalty_members, staff |
| store_id | integer | YES | | FK→stores.id (null=all) |
| is_archived | boolean | NO | false | |
| scheduled_at | timestamptz | YES | | |
| sent_at | timestamptz | YES | | |
| sent_count | integer | YES | 0 | |
| open_count | integer | YES | 0 | |
| created_by | integer | YES | | FK→users.id |
| created_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id), created_by → users(id)

### `marketing_campaigns`
Track email/SMS/push campaigns.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | auto | PK |
| name | varchar(255) | NO | | Campaign name |
| channel | varchar(30) | NO | push | `push`, `sms`, `email` |
| subject | varchar(500) | YES | | Email/push subject |
| body | text | YES | | Message body |
| image_url | varchar(500) | YES | | Campaign image |
| cta_url | varchar(500) | YES | | Call-to-action URL |
| audience | varchar(50) | NO | all | Target audience |
| store_id | integer | YES | | FK→stores.id (null=all stores) |
| status | varchar(30) | NO | draft | `draft`, `scheduled`, `sending`, `sent`, `failed` |
| provider | varchar(50) | YES | | `twilio`, `signal`, `fcm` |
| provider_campaign_id | varchar(255) | YES | | External campaign ID |
| scheduled_at | timestamptz | YES | | Scheduled send time |
| sent_at | timestamptz | YES | | Actual send time |
| completed_at | timestamptz | YES | | Completion time |
| total_recipients | integer | NO | 0 | |
| sent_count | integer | NO | 0 | |
| delivered_count | integer | NO | 0 | |
| opened_count | integer | NO | 0 | |
| clicked_count | integer | NO | 0 | |
| failed_count | integer | NO | 0 | |
| cost | numeric(10,2) | YES | | Campaign cost |
| created_by | integer | YES | | FK→users.id |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**FKs:** store_id → stores(id), created_by → users(id)

---

## Seeded Data

| Entity | Count | Details |
|--------|-------|---------|
| Marketing Campaigns | 3 | Push, SMS, Email |
