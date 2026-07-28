# Admin Portal: Stores

## Pages
- `/stores` — Store Locations
- `/stores/settings` — Store Settings
- `/tables` — Tables
- `/cash-sessions` — Cash Sessions (POS drawer Z-reports)
- `/einvoice` — E-Invoice (LHDN MyInvois documents)

## Purpose
Manage physical store locations, their configuration, operating hours, and dining tables. Review POS cash drawer sessions and e-invoice submissions.

## Store Locations (`/stores`)

### What it shows
A list of all stores with name, code, address, currency, and status.

### Add a new store
1. Click **New Store**.
2. Enter:
   - **Store name** — displayed to customers and staff.
   - **Store code** — short unique code used internally.
   - **Address, postcode, country** — used for delivery radius and receipts.
   - **Currency code** — default `MYR`.
   - **Contact phone and email**.
3. Save.

### Edit a store
1. Click a store row.
2. Update fields as needed.
3. Save changes.

### Store fields reference

| Field | Purpose |
|-------|---------|
| Store name | Customer-facing name. |
| Store code | Internal short code. |
| Address / Postcode / Country | Physical location and delivery calculations. |
| Currency code | Currency used for pricing and payments. |
| Phone / Email | Contact details on receipts and notifications. |
| Is active | Inactive stores are hidden from the PWA and staff portal. |

## Store Settings (`/stores/settings`)

### What it shows
Per-store operational configuration.

### Common settings

| Setting | Purpose |
|---------|---------|
| Service charge (%) | Automatically added to orders. |
| Tax-inclusive pricing | Whether displayed prices already include tax. |
| Rounding rule | How order totals are rounded. |
| Receipt footer | Custom text printed on receipts. |
| Minimum order amount | Minimum subtotal for checkout. |
| Delivery radius (km) | Maximum delivery distance from store. |

### How to change
1. Select the store.
2. Update settings.
3. Save.

## Tables (`/tables`)

### Purpose
Manage dining tables and generate QR codes for dine-in ordering.

### Add a table
1. Click **New Table**.
2. Select the store.
3. Enter section, table number, and capacity.
4. Save.

### Generate a table QR code
1. Open the table detail or row actions.
2. Click **Generate QR**.
3. Download or print the QR code.
4. When a customer scans the code, the PWA opens with the table pre-selected for dine-in.

### Table statuses
- **Available** — no active order.
- **Occupied** — has an active order.
- **Reserved** — booked via reservation.
- **Cleaning** — being cleaned.

### Limitations
- Table QR generation requires the store's public URL to be configured.
- Store managers can only manage tables in assigned stores.

## Cash Sessions (`/cash-sessions`)

Every POS cash drawer session (opened with a float at shift start, closed with a cash count at shift end) appears here.

### What it shows
- Session ID, store and terminal, staff member, opened time, and status (`open` / `closed`).
- Opening float, cash sales, **expected cash** (float + cash sales − cash refunds), counted cash, **variance** (green when it matches, red otherwise), and order count.

### Filters
- By store and by status (open / closed).

### Drill into a session
1. Click **View** on a row.
2. The drawer expands with the full figures (float, cash/card/QR sales, refunds, expected) — computed **live** for open sessions — and the list of payments those figures are built from (time, order, provider, captured, refunded).

### Close an open session
1. Click **Close** on an open row.
2. Enter the counted cash and an optional note, then confirm. The system snapshots expected cash and variance at that moment.

Only one session can be open per store at a time — staff open and close it from the POS drawer chip; this page is for review and for closing a session staff forgot.

## E-Invoice (`/einvoice`)

LHDN MyInvois e-invoice documents generated from paid orders.

### What it shows
Document ID, order number, store, type (**Invoice** / **Refund Note**), document code (`EINV-…`), status, MyInvois UUID, and submission time.

### Statuses
| Status | Meaning |
|--------|---------|
| pending | Created, not yet submitted. |
| submitted | Accepted by MyInvois, awaiting validation. |
| validated | Validated — the validation link is available. |
| rejected / failed | MyInvois rejected it, or the submission errored (see the error in the detail drawer). |
| cancelled | Cancelled after validation (within LHDN's 72-hour window). |

### Review and retry
1. Click **View** to see the full UBL document (JSON), the validation link, and any error message.
2. Click **Retry** on a `pending` / `failed` / `rejected` document to submit it again.

### Important: setup mode vs live mode
- E-invoicing is **config-gated**: nothing is generated until `einvoice.auto_issue` is enabled in **Settings → E-Invoice**, and submissions are **simulated** until `einvoice.enabled` is switched on with real MyInvois credentials (`client_id`, `client_secret`, plus the store's `tin`, `brn`, `msic`, and `sst_number`).
- Before going live, confirm with the accountant whether the business is even required to issue e-invoices yet (LHDN's turnover-band rules, including the RM1M annual-revenue exemption) — that also determines whether per-receipt issuing or monthly B2C consolidation applies.

## Related
- [Menu](menu.md)
- [Inventory](inventory.md)
- [Staff](staff.md)
