# Admin Portal: Staff

## Pages
- `/staff` — Staff Profiles
- `/staff/attendance` — Attendance
- `/staff/shifts` — Shifts
- `/staff/tips` — Tips
- `/admins/roles` — Admin Roles

## Purpose
Create and manage staff profiles, assign roles, set schedules, track attendance, and allocate tips.

## Staff Profiles (`/staff`)

### Add a staff member
1. Click **New Staff**.
2. Enter:
   - **Display name** — name shown in the Staff Portal.
   - **Phone number** — used for login.
   - **Email** — optional contact email.
   - **Store** — the store they work at.
   - **Role** — staff role (cashier, server, kitchen_staff, etc.).
   - **PIN** — temporary login PIN.
3. Save.

### Staff roles

| Role | Staff Portal access |
|------|---------------------|
| `store_manager` | All buttons and pages. |
| `shift_supervisor` | POS, Kitchen, Ops, Orders, Tables, Reservations, Time Clock, Shifts, Tasks, Wallet. |
| `cashier` | POS, Orders, Tables, Reservations, Time Clock, Shifts, Tasks, Wallet. |
| `server` | POS, Orders, Tables, Reservations, Time Clock, Shifts, Tasks, Wallet. |
| `kitchen_staff` | Kitchen, Orders, Tables, Reservations, Time Clock, Shifts, Tasks, Wallet. |
| `delivery_coordinator` | Orders, Tables, Reservations, Time Clock, Shifts, Tasks, Wallet. |

### Edit / deactivate
1. Click a staff row.
2. Update details or set **Is active** to false.
3. Save.

### Reset PIN
1. Open the staff profile.
2. Click **Reset PIN**.
3. Enter a new PIN.
4. Save. The staff member must use the new PIN on next login.

## Attendance (`/staff/attendance`)

### What it shows
A log of staff clock-in, clock-out, start-break, and end-break events.

### Filter
- By staff member.
- By store.
- By date range.
- By event type.

### Verify an event
1. Open the event detail.
2. Review timestamp and optional geolocation.
3. Click **Verify** to mark it as approved.

## Shifts (`/staff/shifts`)

### Shift templates
Create reusable shift templates (e.g., "Morning Shift 08:00–16:00").

### Assign shifts
1. Click **New Shift**.
2. Select staff member, store, date, and template.
3. Save.

### View shifts
Staff can see their upcoming shifts in the Staff Portal under **Shifts**.

## Tips (`/staff/tips`)

### Record a tip
1. Click **New Tip**.
2. Select order, staff members, and allocation method.
3. Enter tip amount.
4. Save.

### Allocation methods
- **Even split** — divided equally among selected staff.
- **Proportional** — based on configurable shares.

## Admin Roles (`/admins/roles`)

### What it shows
A matrix of permissions for admin roles.

### Important note
The permission matrix stores permission rows, but most business endpoints currently enforce access by role key and store assignment, not by these permission rows.

## Related
- [Staff Portal Guide](../staff/index.md)
- [Role & Access Matrix](role-access-matrix.md)
