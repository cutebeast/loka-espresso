# Staff Portal: Role & Access Matrix

## Staff roles

Your staff role is set by an admin in the Admin Portal. It controls which buttons and pages you can see and use.

## Feature matrix

| Feature | store_manager | shift_supervisor | cashier | server | kitchen_staff | delivery_coordinator |
|---------|:-------------:|:----------------:|:-------:|:------:|:-------------:|:--------------------:|
| POS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kitchen Display | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Orders list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reservations | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory / Wastage | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Equipment / Garbage / Grease Trap | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Time Clock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shifts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wallet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## What each role does

### store_manager
Full operational access. Can use POS, kitchen, operational checks, and manage other staff's activities.

### shift_supervisor
Floor supervisor. Can use POS, kitchen, operational checks, and override most day-to-day issues.

### cashier
Focused on checkout. Uses POS, orders, tables, and reservations.

### server
Takes orders and serves tables. Uses POS, orders, tables, and reservations.

### kitchen_staff
Works in the kitchen. Uses kitchen display, orders list, and operational checks.

### delivery_coordinator
Manages delivery flow. Uses orders, tables, and reservations.

## Admin users in the Staff Portal

Admins can log in to the Staff Portal and act as any role. They must pick a store after login. Admin access bypasses most role checks.

## Important notes

- The **Orders** and **Kitchen** pages call admin endpoints. Pure staff tokens may be rejected for some actions; if a kitchen staff member sees permission errors, contact a manager with admin access.
- POS order creation requires one of: `cashier`, `server`, `shift_supervisor`, or `store_manager`.
- Idle timeout is fixed at 30 minutes. You will be logged out automatically if inactive.
- Some features show "coming soon" toasts where hardware integration (receipt printer, cash drawer, kitchen ticket printer) is not yet connected.

## Changing your PIN

1. Go to **Profile**.
2. Tap **Change PIN**.
3. Enter current PIN and new PIN twice.
4. Save.
