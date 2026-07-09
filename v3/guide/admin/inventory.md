# Admin Portal: Inventory

## Pages
- `/inventory/categories` — Inventory Categories
- `/inventory/items` — Inventory Items
- `/inventory/stocks` — Stock Levels
- `/inventory/suppliers` — Suppliers
- `/inventory/movements` — Stock Movements
- `/inventory/purchase-orders` — Purchase Orders

## Purpose
Track ingredients and retail stock across stores, record stock movements, manage suppliers, and create purchase orders.

## Inventory structure

| Object | Purpose |
|--------|---------|
| Inventory Category | Grouping of inventory items (e.g., Dairy, Packaging). |
| Inventory Item | A SKU with unit and reorder thresholds. |
| Inventory Stock | Quantity on hand at a specific store. |
| Supplier | Vendor contact and supply details. |
| Purchase Order | Order stock from suppliers. |
| Stock Movement | Log of stock in/out/adjustments/waste. |

## Inventory Categories (`/inventory/categories`)

### Add a category
1. Click **New Category**.
2. Enter name and description.
3. Save.

## Inventory Items (`/inventory/items`)

### Add an item
1. Click **New Item**.
2. Enter:
   - **Item name** — descriptive name.
   - **Item code** — internal SKU.
   - **Category** — inventory category.
   - **Unit** — e.g., kg, litre, piece.
   - **Reorder level** — threshold for low-stock alerts.
   - **Description** — optional notes.
3. Save.

### Link to menu items
Some inventory items can be linked to menu item recipes so that preparing an order deducts stock automatically.

## Stock Levels (`/inventory/stocks`)

### Set stock
1. Select the store.
2. Select the item.
3. Enter current quantity.
4. Save.

### Low stock alerts
Items below their reorder level appear highlighted. Replenish via purchase orders or manual movements.

## Suppliers (`/inventory/suppliers`)

### Add a supplier
1. Click **New Supplier**.
2. Enter name, contact person, phone, email, address, and payment terms.
3. Save.

## Stock Movements (`/inventory/movements`)

### Record a movement
1. Click **New Movement**.
2. Select:
   - **Type** — in, out, adjustment, waste.
   - **Item** and **store**.
   - **Quantity** — positive number.
   - **Reason** — optional note.
3. Save.

### Movement types

| Type | When to use |
|------|-------------|
| In | Receiving stock without a purchase order. |
| Out | Removing stock for a non-order reason. |
| Adjustment | Correcting a count discrepancy. |
| Waste | Recording spoilage or wastage. |

## Purchase Orders (`/inventory/purchase-orders`)

### Create a purchase order
1. Click **New Purchase Order**.
2. Select supplier and store.
3. Enter expected delivery date.
4. Add line items with quantities and unit costs.
5. Save as **Draft**.

### Purchase order lifecycle

| Status | Meaning |
|--------|---------|
| Draft | Not yet sent to supplier. |
| Ordered | Sent to supplier. |
| Partially Received | Some items received. |
| Received | All items received. |
| Cancelled | Cancelled. |

### Receive a purchase order
1. Open the purchase order.
2. Click **Receive**.
3. Enter received quantities.
4. Save. Stock levels update automatically.

## Staff inventory tasks
Staff can also update stock from the Staff Portal under **Inventory** and report wastage under **Wastage**.

## Related
- [Menu](menu.md)
- [Staff — Inventory tasks](../staff/operations.md)
