# Admin Frontend Guide

> Admin dashboard at `admin.loyaltysystem.uk`

## Architecture
- Next.js 16 single-page app with hash routing
- Pure CSS, no framework
- Dynamic imports for all 19 pages

## Role-Based Access (3 tiers)

| Role | Type ID | Access |
|---|---|---|
| Service Crew | 3 | Counter Operations only (4 pages) |
| Store Manager | 2 | Counter + Store Ops + CRM + Analytics + Store Settings |
| Admin/HQ | 1 | Full access (all 19 pages) |

## Sidebar Navigation

| Section | Pages |
|---|---|
| Counter Operations | Tables, Order Station, POS Terminal, Wallet Top-Up |
| Menu & Products | Menu Management (HQ only) |
| Store Operations | Dashboard, Orders, Inventory, Staff |
| CRM & Marketing | Customers, Rewards, Vouchers, Promotions, Information, Notifications, Feedback |
| Analytics | Sales Reports, Marketing ROI |
| System & Config | Store Settings, App Settings, PWA Settings, Loyalty Rules, Audit Log |

## Key Features
- **Notification Templates**: Full CRUD in Push Notifications page
- **QR Scanner**: Both POS Terminal and Wallet Top-Up have customer QR scan
- **POS Terminal**: Redeem rewards/vouchers by scanning codes
- **PWA Settings**: OTP bypass, country code, notification retention days, rebuild trigger

## Mobile View
4 service crew pages only (Tables, Order Station, POS, Top-Up). Bottom nav on mobile.
