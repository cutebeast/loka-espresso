# Admin Portal: Role & Access Matrix

## Two separate role systems

Loka Espresso uses two independent role systems:

1. **Admin account roles** — used for the Admin Portal. Stored in `role_assignments`.
2. **Staff profile roles** — used for the Staff Portal. Stored on `staff_profiles.role`.

A single person can have both, but the two do not mix automatically.

## Admin Portal roles

| Role | Portal access | Store scope | Key abilities |
|------|---------------|-------------|---------------|
| `system_admin` | Full Admin Portal | All stores | Can create other system admins, manage IAM roles, access all settings. |
| `regional_manager` | Full Admin Portal | All stores | Multi-store oversight; HQ bypass on store-scoped endpoints. |
| `store_manager` | Full Admin Portal UI | Assigned stores only | Day-to-day store management. Backend store scoping restricts data to assigned stores. |
| `readonly_analyst` | Full Admin Portal UI | All stores | Treated as HQ for viewing. Note: all mutations are blocked (403) by the central write-guard. |

## Staff Portal roles (for reference)

These roles cannot log in to the Admin Portal. They are managed under **Staff → Staff Profiles**.

| Role | Typical use |
|------|-------------|
| `shift_supervisor` | Floor supervisor; can use POS, Kitchen, and Ops. |
| `cashier` | POS checkout and order handling. |
| `server` | Table service and order taking. |
| `kitchen_staff` | Kitchen display system (KDS). |
| `delivery_coordinator` | Delivery dispatch and order tracking. |

## Section access by admin role

| Admin Portal section | system_admin | regional_manager | store_manager | readonly_analyst |
|----------------------|:------------:|:----------------:|:-------------:|:----------------:|
| Dashboard | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Stores | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Menu | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Inventory | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Staff | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Customers | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Orders | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Refunds | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Reservations | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Marketing | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Loyalty | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Content | ✅ | ✅ | ✅ | ✅ |
| Reports | ✅ | ✅ | ✅ (assigned stores) | ✅ |
| Audit Log | ✅ | ✅ | ❌ | ✅ |
| Settings | ✅ | ✅ | ❌ | ✅ |
| Translations | ✅ | ✅ | ❌ | ✅ |

> The sidebar is rendered for every authenticated admin, but backend endpoints enforce store scoping and role checks. A `store_manager` may see all menu items but will only receive data for assigned stores.

## Important limitations and caveats

- **Permission rows are informational.** The matrix under **Admin → Admin Roles** stores permission rows, but most business endpoints enforce access via role-key checks and store scoping, not those permission rows.
- **`StoreAssignment` flags are unused.** `can_approve_refunds`, `can_adjust_inventory`, and `can_manage_staff` are stored but not enforced by the backend.
- **`readonly_analyst` is treated as HQ for viewing data but all mutations are blocked (403) by the central write-guard.** It can see all stores and is not blocked from write endpoints.
- **Staff roles cannot use the Admin Portal.** `/admin/auth/me` rejects pure staff-profile tokens.

## Best practice

Assign the lowest role that still allows the user to complete their job. Use `system_admin` sparingly, and assign `store_manager` only to stores they need to manage.
