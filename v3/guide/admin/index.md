# Admin Portal Guide

## What the Admin Portal is for

The Admin Portal (`admin.loyaltysystem.uk`) is the back-office control centre for the Loka Espresso platform. It is used to configure stores, build menus, manage inventory, create staff accounts, run marketing campaigns, set up loyalty programs, process refunds, view reports, and control platform settings.

## Who should use this guide

- **System administrators** — full platform access.
- **Regional managers** — multi-store oversight.
- **Store managers** — single or assigned-store management.
- **Readonly analysts** — view-only access across all stores (note: write restrictions are not enforced by most endpoints).

## First login

1. Open `admin.loyaltysystem.uk`.
2. Enter your email and password.
3. If OTP is enabled, enter the code sent to your registered device.
4. The Dashboard loads.

## Main sections

| Section | Pages | Purpose |
|---------|-------|---------|
| [Dashboard](dashboard.md) | Dashboard | Business overview and KPIs. |
| [Stores](stores.md) | Locations, Settings, Tables | Store configuration, operating hours, table layout, QR codes. |
| [Menu](menu.md) | Categories, Items, Bundle Products, Allergens, Dietary Tags, Tax Categories | Build and maintain the customer-facing menu. |
| [Inventory](inventory.md) | Categories, Items, Stock Levels, Suppliers, Movements, Purchase Orders, Equipment, Hygiene | Track ingredients, stock, suppliers, equipment health, and hygiene compliance. |
| [Staff](staff.md) | Staff Profiles, Attendance, Shifts, Tips, Roles | Manage staff, schedules, attendance, and tip allocation. |
| [Customers](customers.md) | Customers, Consents, Devices, Feedback | View customer data, consents, devices, and feedback. |
| [Orders & Refunds](orders-and-refunds.md) | Orders, Refunds, Reservations | Manage orders, process refunds, handle reservations. |
| [Marketing](marketing.md) | Rewards, Promotions, Vouchers, Surveys, Referrals, Campaigns, Check-ins | Create offers, campaigns, surveys, and referral programs. |
| [Loyalty](loyalty.md) | Tiers, Accounts, Ledger, Settings | Configure points, tiers, and customer loyalty accounts. |
| [Content](content.md) | Info Cards, Products, Events, System Pages, PWA Splash | Manage in-app content and legal pages. |
| [Notifications](notifications.md) | Notifications, Templates, Reports | Create and send push notifications to customers. |
| [Reports & Audit](reports-and-audit.md) | Reports, Audit Log | Sales reports and account activity logs. |
| [Settings](settings.md) | App Settings, Payment Gateway, Twilio Verify, Version Control | Platform configuration. |
| [Translations](translations.md) | Translations | Manage UI and content translations. |

## Ordering journey from the admin view

1. A customer places an order through the PWA or a staff member creates it in the POS.
2. The order appears in **Orders** with status `pending`.
3. Staff confirm the order → status becomes `confirmed`.
4. Kitchen prepares the order → `preparing`, then `ready_for_pickup` or `out_for_delivery`.
5. Payment is captured automatically for online payments, or manually in POS for cash.
6. If a refund is needed, open the order and use **Refund**.
7. Reports aggregate order data for analysis.

## Important concepts

### Store scoping
Most data in the Admin Portal belongs to a store. Store managers only see data for stores they are assigned to. HQ roles see all stores.

### Role-based access
Effective access is based on role key and store assignment. The permission matrix under **Admin Roles** stores permission rows, but most business endpoints enforce access by role key and store scoping instead.

### Translations
The platform supports `en`, `ms`, `zh`, `ta`, and `tr`. UI text and translatable content are managed in the **Translations** section.

### Editing records
When you open an edit page (e.g. `/stores/123`, `/staff/456`), the portal loads the record from the API. If the ID does not exist or you do not have access, the page shows a **Not Found** state with a back button instead of a blank form. Use the back button to return to the list and check the correct ID.
