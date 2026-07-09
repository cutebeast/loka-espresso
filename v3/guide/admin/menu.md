# Admin Portal: Menu

## Pages
- `/menu/categories` — Menu Categories
- `/menu/items` — Menu Items
- `/menu/bundle-products` — Bundle Products
- `/menu/allergens` — Allergens
- `/menu/dietary-tags` — Dietary Tags
- `/menu/tax-categories` — Tax Categories

## Purpose
Build and maintain the customer-facing menu. Changes are reflected immediately in the Customer PWA and Staff POS.

## Menu structure

| Object | Purpose |
|--------|---------|
| Category | Grouping of menu items (e.g., Coffee, Pastry). |
| Menu Item | A product with price, description, and availability. |
| Modifier Group | Optional or required add-ons (e.g., Milk alternatives, Size). |
| Modifier Option | A single choice inside a modifier group. |
| Allergen | Food safety flags (e.g., Nuts, Gluten). |
| Dietary Tag | Labels like Vegan, Halal. |
| Tax Category | Tax rules applied to items. |
| Bundle Product | Combo meals or fixed/pick-and-choose sets. |

## Menu Categories (`/menu/categories`)

### Add a category
1. Click **New Category**.
2. Enter name, description, and sort position.
3. Upload a category image if desired.
4. Set **Active**.
5. Save.

### Edit / delete
1. Click the category row.
2. Update fields or click **Delete**.

## Menu Items (`/menu/items`)

### Add a menu item
1. Click **New Item**.
2. Fill in:
   - **Name** — customer-facing item name.
   - **Description** — short description shown in the PWA.
   - **Long description** — detailed description.
   - **Price** — base price.
   - **Category** — the category this item belongs to.
   - **Tax category** — tax rule to apply.
   - **Item code** — internal SKU.
3. Add allergens and dietary tags.
4. Upload item images.
5. Set availability and active status.
6. Save.

### Attach modifiers
1. Open an item.
2. Go to the **Modifiers** tab.
3. Select existing modifier groups or create new ones.
4. Set min/max selection rules.
5. Save.

### Set out of stock
1. From the item list, toggle **Out of Stock**.
2. The item remains visible but cannot be ordered.

## Modifier Groups

### Create a modifier group
1. In an item's Modifiers tab, click **New Modifier Group**.
2. Enter group name.
3. Set selection rules:
   - **Min** — minimum options a customer must select.
   - **Max** — maximum options a customer can select.
4. Add options with names and price adjustments.
5. Save.

### Example
- Group: "Choose milk"
  - Whole milk — +RM0
  - Oat milk — +RM1
  - Almond milk — +RM1.50

## Allergens (`/menu/allergens`)

### Add an allergen
1. Click **New Allergen**.
2. Enter allergen key, display name, and severity (low, medium, high).
3. Save.

### Usage
Attach allergens to menu items. Customers see allergen warnings in the PWA.

## Dietary Tags (`/menu/dietary-tags`)

### Add a dietary tag
1. Click **New Tag**.
2. Enter tag key, display name, and color.
3. Save.

### Usage
Attach tags to menu items for filtering (e.g., Vegan, Halal, Gluten Free).

## Tax Categories (`/menu/tax-categories`)

### Add a tax category
1. Click **New Tax Category**.
2. Enter name and tax rate.
3. Save.

### Usage
Assign tax categories to menu items. The POS and PWA calculate tax based on store settings (inclusive vs exclusive).

## Bundle Products (`/menu/bundle-products`)

### Bundle types

| Type | Description |
|------|-------------|
| Fixed Set | Pre-defined items at a fixed price. |
| Pick & Choose | Customer selects items from pools within rules. |
| Multi-Course | Sequential courses (e.g., starter + main + drink). |

### Create a bundle
1. Click **New Bundle Product**.
2. Choose bundle type.
3. Enter name, description, and price.
4. Add components and selection rules.
5. Save.

### Component rules
- Define which items can be selected.
- Set quantity limits per component.
- Set optional vs required components.

## Tips

- Use **position** to control display order.
- Mark items out of stock rather than deleting them to preserve historical order data.
- Changes are reflected immediately in the POS and PWA.
- Use bundle products for promotions and meal deals.

## Related
- [Inventory](inventory.md)
- [Marketing — Promotions](marketing.md)
- [Customer PWA — Menu](../customer/menu-and-ordering.md)
