# Admin Portal: Reports & Audit

## Pages
- `/reports` — Reports
- `/audit-log` — Audit Log

## Purpose
Analyse business performance and trace account activity.

## Reports (`/reports`)

### Available reports

| Report | Description |
|--------|-------------|
| Sales summary | Revenue, orders, and average order value over time. |
| Sales by store | Revenue broken down by store. |
| Sales by item | Best-selling and worst-selling menu items. |
| Sales by category | Revenue by menu category. |
| Payments | Payment method breakdown and reconciliation. |
| Discounts & vouchers | Total discounts, voucher redemptions, and impact. |
| Tips | Tip totals and allocations. |
| Customers | New registrations, active customers, and retention. |

### How to use
1. Select report type.
2. Set date range.
3. Select store(s) if applicable.
4. Click **Generate**.
5. View on screen or export to CSV.

### Export
Most reports support CSV export for spreadsheet analysis.

## Audit Log (`/audit-log`)

### What it shows
A record of actions performed in the Admin Portal and by the backend.

### Logged fields
- Timestamp
- Action (create, update, delete, login, etc.)
- Resource type and ID
- Principal (user who performed the action)
- IP address
- Severity

### Filter
- By action type.
- By resource type.
- By severity.
- By date range.
- By principal.

### Use cases
- Trace who changed a menu price.
- Investigate unauthorized actions.
- Compliance and security review.

## Related
- [Dashboard](dashboard.md)
- [Orders](orders-and-refunds.md)
