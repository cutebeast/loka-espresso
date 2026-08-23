# Admin Portal: Dashboard

## Page
`/`

## Purpose
The Dashboard gives a high-level overview of business performance. It is the first screen after login.

## What you see

| Widget | Description |
|--------|-------------|
| Active Orders | Count of orders currently in `pending`, `confirmed`, `preparing`, or `ready_for_pickup` status. |
| Total Revenue | Net captured revenue (payments minus refunds) for the selected period. |
| Total Orders | Count of orders placed in the selected period. |
| Total Customers | Count of registered customers. |
| Orders by Type | Breakdown of dine-in, takeaway, and delivery orders. |
| Revenue for Period | Revenue trend chart for the selected date range. |

## How to use

1. Use the date picker to change the reporting period (today, week, month, custom).
2. Use the store selector (if HQ) to filter by one or all stores.
3. Click an order count widget to navigate to the Orders list with the relevant filter pre-applied.

## Limitations

- Dashboard data is store-scoped for `store_manager`.
- Real-time updates require a manual refresh; it does not auto-poll.

## Related
- [Orders](orders-and-refunds.md)
- [Reports](reports-and-audit.md)


## Payment Status Filter

All revenue and order-count widgets count only captured money (revenue is net of refunds):
- Today's orders/revenue — only paid orders
- Period orders/revenue — only paid orders
- Orders by type + monthly charts — only paid orders
- Active orders KPI intentionally shows pending/confirmed/preparing (kitchen-active)

Unpaid kiosk orders, abandoned PWA carts, and pending walkaway orders are excluded from all revenue metrics. Unpaid pay-before-food orders auto-cancel in the background (a sweep runs every 5 minutes): kiosk orders after **15 minutes**, all other prepaid orders after **2 hours**. Open tabs (`pay_after_meal`) are never auto-cancelled.


## Payment Flow Split

Orders carry `payment_flow`: `prepaid` (pay-before-food) or `pay_after_meal` (open tab). Revenue metrics count captured payments regardless of flow; unpaid open tabs never appear in revenue — only captured amounts do.
