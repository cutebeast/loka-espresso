# Admin Portal: Customers

## Pages
- `/customers` — Customer List
- `/customers/consents` — Customer Consents
- `/customers/devices` — Customer Devices
- `/feedback` — Feedback

## Purpose
View and manage customer profiles, consent records, registered devices, and feedback submissions.

## Customer List (`/customers`)

### What it shows
All registered customers with name, phone, email, loyalty tier, and total spend.

### Search and filter
- Search by name, phone, or email.
- Filter by loyalty tier.
- Filter by store (for store-scoped admins).

### Customer detail (`/customers/[id]`)
1. Click a customer row.
2. View profile, loyalty account, wallet balance, addresses, orders, and consents.
3. Adjust loyalty points if permitted.
4. View or add notes.

### Actions on a customer
- **Edit profile** — update name, phone, email, DOB.
- **Adjust points** — add or deduct loyalty points with a reason.
- **View orders** — list of all orders placed by the customer.
- **View wallet** — wallet balance and transaction history.

## Customer Consents (`/customers/consents`)

### What it shows
Records of customer consent for marketing, terms of service, privacy policy, and push notifications.

### Consent statuses
- **Granted** — customer agreed.
- **Revoked** — customer withdrew consent.
- **Withdrawn** — fully removed.

### Marketing opt-out
Customers with `marketing_opt_out = true` are automatically excluded from marketing campaigns.

## Customer Devices (`/customers/devices`)

### What it shows
Registered customer devices for push notifications.

### Columns
- Device model and platform.
- Last seen timestamp.
- Active status.

### Usage
Use this list to debug push notification delivery issues.

## Feedback (`/feedback`)

### What it shows
Customer feedback submissions from the PWA help/support form.

### Actions
- View feedback details.
- Reply to the customer.
- Mark as resolved.
- Export feedback for analysis.

## Related
- [Loyalty](loyalty.md)
- [Marketing — Campaigns](marketing.md)


## Wallet

Each customer has a wallet (created on first use). Admin can:
- View wallet balance and ledger (all transactions)
- Add credits or debits via admin adjustment (**HQ admins only** — system_admin / regional_manager; store managers cannot move wallet money)
- View voucher and reward balances

> Redemption note: vouchers and rewards in the wallet are **order-tied** — they are consumed when applied to an order (staff apply them in the POS checkout drawer, customers at app checkout), never standalone. There is no "mark used" action.

## Vouchers

Assign voucher codes to customers. Vouchers have:
- Expiry date
- Usage limits (total / per customer)
- Minimum order value
- Discount type (percentage / fixed amount)
