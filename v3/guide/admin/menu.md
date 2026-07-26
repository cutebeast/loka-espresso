# Admin Portal: Menu

## Pages
- `/menu/items` — Menu Items
- `/menu/categories` — Categories
- `/menu/bundle-products` — Bundle Products
- `/menu/allergens` — Allergens
- `/menu/dietary-tags` — Dietary Tags
- `/menu/tax-categories` — Tax Categories

Experiences and events live in their own sidebar section, **Events & Classes**:
- `/events/workshops` — Experiences & Workshops
- `/events` — Event Cards
- `/events/report` — RSVP Report

## Purpose
Build and maintain the customer-facing menu. Changes are reflected in the Customer PWA and Staff POS. Item names and descriptions are auto-translated (DeepSeek, with F&B context) when saved.

## Menu structure

| Object | Purpose |
|--------|---------|
| Category | Grouping of menu items (e.g., Coffee, Pastry). |
| Menu Item | A product with price, description, and availability. |
| Variant | A named version of an item with a price adjustment. |
| Modifier Group | Optional or required add-ons (e.g., Extra Shot, milk choice). |
| Modifier Option | A single choice inside a modifier group, with price adjustment. |
| Allergen | Food safety flags with severity. |
| Dietary Tag | Labels like Halal, Vegan. |
| Tax Category | Tax rate applied to items. |
| Bundle Product | Combos, Pick & Choose sets, multi-course sets. |
| Experience / Workshop | Bookable, capacity-limited menu items (see below). |
| Event Card | PWA event listing with optional RSVP. |

## Categories (`/menu/categories`)

### Add a category
1. Click **New Category**.
2. Enter name, description, image, and sort position.
3. Set it available and save.

> The **Experiences** category is reserved for workshops — it is managed from Events & Classes, and items cannot be moved into or out of it (see below).

## Menu Items (`/menu/items`)

### Add a menu item
1. Click **New Item**.
2. Fill in:
   - **Name**, **description** — customer-facing text (auto-translated on save).
   - **Item code** — internal SKU.
   - **Base price** — plus optional cost price, prep time (minutes), and calories.
   - **Category** and **tax category**.
   - **Allergens** and **dietary tags**.
   - **Images**.
   - **Availability** — unavailable items cannot be ordered in the PWA or POS.
3. Save.

### Variants and modifiers
- **Variants** are named versions of the item with a price adjustment.
- **Modifier groups** attach add-on choices with min/max selection rules — e.g. an "Extra Shot" group for espresso add-ons, or a milk-choice group:

  - Group: "Choose milk" (min 1, max 1)
    - Whole milk — +RM0
    - Oat milk — +RM1

### Add-on deals
Items flagged as **add-on deal eligible** get a discount (percentage or fixed amount, configured on the item) when the customer's cart contains a qualifying bundle product — the PWA offers them as upsells at the discounted price.

## Experiences & Workshops (`/events/workshops`)

Bookable experiences (e.g. the Omakase coffee experience) are **menu items in the reserved `experiences` category** (item codes `EX-*`) with dated, capacity-limited sessions.

### What the page shows
- All experience items with their price and availability.
- Each item's **sessions** — date, start time, capacity, seats booked, location, notes. Add sessions inline on this page.
- Recent **booking orders** — orders containing experience items.

### How booking works
- Customers book and pay in the PWA: they pick a session, and seats are consumed when the order is created (restored if the order is cancelled). A full session cannot be overbooked.
- Staff can also sell workshop slots at the **POS** — then a **customer must be attached** to the order (phone number is the identity anchor; the anonymous walk-in profile cannot hold class bookings) and a session must be selected for every workshop line. For normal menu orders, attaching a customer stays optional.
- Workshop bookings are orders — they are tracked separately from table reservations, which are a different system (see Orders & Refunds).

### The locked category
The `experiences` category is sealed in both directions:
- Workshop items cannot be recategorized to normal menu categories.
- Normal menu items cannot be moved into the Experiences category — create classes from **Events & Classes → Workshops** instead.

## Event Cards (`/events`)

Event cards are the event listings shown in the PWA — again, separate from table reservations.

### Event types

| Type | Behavior |
|------|----------|
| Public | Any customer can RSVP (when RSVP is enabled). |
| Invite only | Only customers on the event's invite list can RSVP. |
| Paid | Informational card — booking happens through the paid workshop flow above; RSVP stays off. |

### Managing cards
- Each card has a title, descriptions, image, location, event date/time, optional start/end display dates, and a position.
- Enable **RSVP** per card and set a **maximum capacity**; the current RSVP count is tracked on the card.
- Track responses under **RSVP Report** (`/events/report`).

## Bundle Products (`/menu/bundle-products`)

### Bundle types

| Type | Description |
|------|-------------|
| Fixed combo | Pre-defined items at a set price. Marketing labels: Combo, Value Meal, Family Meal, Breakfast Set, Promotional. |
| Pick & Choose | Customer picks N items from a pool. Set the pick count and whether duplicates are allowed; without duplicates the pool must contain at least N items. |
| Multi-course set | Sequential courses (e.g. starter + main + drink). Each course is a **group** with its own pick count and min/max rules; components are assigned to groups. |

### Create a bundle
1. Click **New Bundle Product**.
2. Choose the bundle type and enter title, description, image, and bundle price.
3. Set **max per order** (default 1), optional start/end dates, and display order.
4. Add components — each links a menu item with a default quantity; modifier options can be preset per component.
5. Save (title and description are auto-translated).

### Component rules
- Every component links an existing menu item — create the items first.
- For Pick & Choose, the component list is the pool customers pick from.
- For multi-course, create groups first, then assign each component to a group.

## Allergens (`/menu/allergens`)

1. Click **New Allergen**.
2. Enter allergen key, display name, and severity (`low`, `medium`, `high`, `critical`).
3. Attach allergens to menu items — customers see the warnings in the PWA.

## Dietary Tags (`/menu/dietary-tags`)

Labels such as Halal or Vegan used for filtering and display. Enter tag key, display name, and color, then attach tags to items. Loka Espresso is a halal coffee house — tag items consistently so customers can filter with confidence.

## Tax Categories (`/menu/tax-categories`)

Named tax rates assigned to menu items. Enter a name and rate; assign the category on each item.

## Tips

- Prefer marking items unavailable over deleting them — historical orders keep their item snapshots either way, but availability toggles are reversible.
- Use position/display order fields to control the order customers see.
- Workshop capacity is enforced per session — raise capacity by adding sessions, not by editing booked counts.

## Related
- [Inventory](inventory.md)
- [Marketing](marketing.md)
- [Translations](translations.md)
