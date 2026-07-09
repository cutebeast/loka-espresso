# Admin Portal: Notifications

## Pages
- `/notifications` — Notification List
- `/notifications/new` — Create Notification
- `/notifications/[id]` — Edit Notification
- `/notifications/templates` — Templates
- `/notifications/templates/[id]` — Edit Template
- `/notifications/report` — Notification Report

## Purpose
Create and send push notifications to customer devices, manage notification templates, and view delivery reports.

## Push Notifications (`/notifications`)

### What it shows
A list of all push notifications with filters for status, audience segment, and date.

### Notification statuses

| Status | Meaning |
|--------|---------|
| Draft | Not yet sent — still being edited. |
| Scheduled | Will send at the scheduled time. |
| Sent | Delivered to the audience segment. |
| Archived | Hidden from the default list. |

### Create a notification
1. Click **New Notification**.
2. Enter:
   - **Title** — short heading shown to customers.
   - **Body** — main message content.
   - **Image URL** — optional image.
   - **Target audience** — choose a customer segment (all, by tier, by last order date, etc.).
   - **Deep link** — optional URL or page the notification opens.
3. Save as **Draft** or schedule for a future date.
4. Click **Send** to deliver immediately (or wait for the scheduled time).

### Send and archive
- **Send** — delivers the notification to the selected audience via push notification.
- **Archive** — moves a sent notification out of the default list without deleting it.

### Notification Report (`/notifications/report`)
View delivery statistics: sent count, delivered count, opened count, and error/failure details per notification.

## Templates (`/notifications/templates`)

### What it shows
Reusable message templates for common notification types.

### Create a template
1. Click **New Template**.
2. Enter:
   - **Template name** — internal label.
   - **Type** — push, email, SMS, WhatsApp.
   - **Title template** — can include `{customer_name}` placeholders.
   - **Body template** — can include `{store_name}`, `{order_id}`, etc.
3. Save.

### Using a template
When creating a new notification, select a template from the **Quick fill from template** dropdown to pre-populate the title and body.

## How push notifications work

1. Admin creates a notification and clicks **Send**.
2. The backend looks up device tokens for customers in the target segment who have push notifications enabled.
3. The Web Push service delivers the notification to each device.
4. Customers see the notification on their device and tap to open the PWA.
5. Delivery results appear in the Notification Report.

> Customers must have granted push notification permission in the PWA. Devices that are inactive or have revoked permissions will be skipped.

## Related
- [Marketing — Campaigns](marketing.md) — for push/SMS/email marketing campaign blasts.
- [Customer PWA — Notifications](../customer/profile-and-settings.md) — how customers manage their notification settings.
