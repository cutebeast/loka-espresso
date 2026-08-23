# Staff Portal Guide

## What the Staff Portal is for

The Staff Portal is where daily store operations happen: taking orders at the POS, managing the kitchen display, tracking tables, handling reservations, clocking in and out, completing tasks, and reporting operational issues.

## Who should use this guide

- **Cashiers** — POS checkout and payment handling.
- **Servers** — Order taking and table service.
- **Kitchen staff** — Kitchen display system (KDS).
- **Shift supervisors** — Floor supervision, POS, kitchen, and operational checks.
- **Store managers** — Full operational access.
- **Delivery coordinators** — Delivery order tracking and dispatch.

## First login

1. Open the Staff Portal URL.
2. Enter your phone number or staff credentials.
3. Enter your PIN.
4. If you are an admin user, select the store you want to work in.

## Main sections

| Section | Pages | Purpose |
|---------|-------|---------|
| [Getting Started](getting-started.md) | Home dashboard | Understand your role and available buttons. |
| [POS Checkout](pos-checkout.md) | POS | Create orders, apply discounts, take payments. |
| [Kitchen Display](kitchen-display.md) | Kitchen, Kitchen detail | View and update order preparation status. |
| [Orders & Tables](orders-and-tables.md) | Orders, Tables | View order queue and table status. |
| [Reservations](reservations.md) | Reservations | View and manage table reservations. |
| [Time Clock & Shifts](time-clock-and-shifts.md) | Time Clock, Shifts | Clock in/out and view upcoming shifts. |
| [Tasks](tasks.md) | Tasks | Complete assigned operational tasks. |
| [Wallet](wallet.md) | Wallet | Top up or check customer wallet balances. |
| [Operations](operations.md) | Inventory, Equipment, Garbage, Grease Trap, Wastage | Operational checks and stock updates. |

## Ordering journey from the staff view

1. Customer arrives or places an order remotely.
2. Staff opens **POS** and selects order type (dine-in or takeaway).
3. For dine-in, staff selects or scans a table.
4. Staff adds items and modifiers, and attaches the customer (needed for vouchers, rewards, and wallet payment).
5. At checkout, staff applies one voucher or reward (never both) and takes payment (cash, card, QR, or wallet).
6. Order appears in **Kitchen Display** for preparation.
7. Kitchen updates status: `confirmed` → `preparing` → `ready_for_pickup`.
8. Server delivers the order or customer collects it.
9. Order status is updated to `delivered` or `completed`.

## Cross-references

- For back-office setup, see the [Admin Portal Guide](../admin/index.md).
- For the customer experience, see the [Customer PWA Guide](../customer/index.md).
- [Customer Display](pos-customer-display.md) — Customer-facing display setup and usage
