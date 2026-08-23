# Loka Espresso Help Center

Welcome to the Loka Espresso internal guide. This resource is here to help everyone using the system understand every page, feature, workflow, and access limitation.

## Three guides in one

| Section | For | What it covers |
|---------|-----|----------------|
| [Admin Portal Guide](admin/index.md) | Store managers, regional managers, system admins | Back-office setup and management: stores, menu, inventory, staff, orders, marketing, loyalty, reports, settings. |
| [Staff Portal Guide](staff/index.md) | Cashiers, servers, kitchen staff, shift supervisors, delivery coordinators | Day-to-day operations: POS, kitchen display, tables, reservations, time clock, tasks, inventory checks. |
| [Customer PWA Guide](customer/index.md) | Customer-facing app users (and support staff) | How customers browse the menu, place orders, earn loyalty points, redeem rewards, manage their profile, and pay. |

## Ordering journey overview

The same order can be created from three different entry points. Each guide explains the journey from that point of view:

1. **Customer PWA** — customer browses menu, customises items, checks out, and pays. Also the **kiosk** (in-store self-ordering) — guests order freely; redemption needs an OTP sign-in at checkout.
2. **Staff POS** — staff creates the order for the customer, attaches them by phone/QR, applies one voucher or reward (never both), and takes payment.
3. **Admin Portal** — managers monitor the order, update status, handle refunds, and run reports.

Golden rules across all channels: **one voucher OR one reward per order** (never both); redemptions are always tied to an order and are released automatically when the order is cancelled (including auto-cancel: kiosk after 15 minutes, other unpaid prepaid orders after 2 hours); loyalty points are estimated at checkout and credited when the payment is captured, with proportional clawback on refunds.

Cross-references between the three guides are included so you can follow an order end-to-end.

## Common terms

| Term | Meaning |
|------|---------|
| **PWA** | Progressive Web App — the customer-facing app (mobile browser or installed). |
| **POS** | Point of Sale — the staff checkout screen. |
| **KDS** | Kitchen Display System — the staff kitchen screen. |
| **Store scope** | Many records (orders, staff, inventory) belong to one store. Users only see data for stores they are assigned to. |
| **HQ bypass** | `system_admin`, `regional_manager`, and `readonly_analyst` can see all stores without individual assignments. |

## Quick links

- [Admin Portal Guide](admin/index.md)
- [Staff Portal Guide](staff/index.md)
- [Customer PWA Guide](customer/index.md)
- [Frequently Asked Questions](faq.md)
- [Role & Access Matrix — Admin](admin/role-access-matrix.md)
- [Role & Access Matrix — Staff](staff/role-access-matrix.md)
- [Customer](customer/) — Including Kiosk self-ordering
