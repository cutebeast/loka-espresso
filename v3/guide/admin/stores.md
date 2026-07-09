# Admin Portal: Stores

## Pages
- `/stores` — Store Locations
- `/stores/settings` — Store Settings
- `/tables` — Tables

## Purpose
Manage physical store locations, their configuration, operating hours, and dining tables.

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

## Related
- [Menu](menu.md)
- [Inventory](inventory.md)
- [Staff](staff.md)
