# Menu Database Refactor Plan

## Problem Statement

The codebase has a **schema-business contradiction** that causes repeated confusion:

| Layer | What It Says |
|---|---|
| **Database schema** | `MenuCategory.store_id` and `MenuItem.store_id` are `NOT NULL` FK → "every menu item belongs to a specific store" |
| **Business requirement** | One universal HQ menu. All stores show the same items, categories, and prices. |
| **API implementation** | PWA endpoints moved to `/menu/categories` and `/menu/items` — no store parameter |
| **Admin implementation** | Admin endpoints moved to `/admin/categories` and `/admin/items` — no store parameter |
| **PWA frontend** | Home and Menu pages were recently blocked behind a "select a store first" guard (now reverted) |

This contradiction is the **root cause** of the repeated back-and-forth. When the schema says "per-store" but the app says "universal", every developer (including AI agents) makes conflicting assumptions.

---

## Verified: Ordering Journey IS Correct

After reverting the incorrect store-selection blocks, the PWA ordering flow matches the reference HTML exactly:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Home /    │ ──► │    Cart     │ ──► │  Checkout   │ ──► │   Success   │
│    Menu     │     │   Review    │     │  Finalize   │     │   Track     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │
      │  • Add items freely — NO store selection
      │  • Universal menu from HQ (store_id=0)
      │  • Dine-in via QR scan (handled by service crew)
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CartPage.tsx                                                           │
│  • Order type pills: Pickup / Delivery / Dine-in                       │
│  • Dine-in disabled unless QR scanned                                  │
│  • Store context card shown (for pickup/delivery)                      │
│  • "Proceed to Checkout" CTA                                           │
└─────────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CheckoutPage.tsx                                                       │
│  • Order type pills (re-confirm)                                       │
│  • Store <select> dropdown — ONLY for Pickup & Delivery                │
│  • Delivery Address card — ONLY for Delivery                           │
│  • Scheduled time picker                                               │
│  • Voucher / reward selector                                           │
│  • Payment method (Wallet / COD / Pay at Store / Pay at Counter)       │
│  • Place Order → creates order with real store_id (>0)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Store selection is ONLY needed for:**
1. **Pickup** → choose which store to collect from
2. **Delivery** → choose which store fulfills the order + enter delivery address

**Store selection is NOT needed for:**
- Browsing menu or adding to cart
- Promotions, rewards, information
- Profile, loyalty points, settings
- Dine-in (handled by QR scan at table)

---

## Root Cause: Confused Database Schema

### Tables with `store_id` in `menu.py`

| Model | `store_id` column | Should keep? | Reason |
|---|---|---|---|
| `MenuCategory` | `NOT NULL` FK `stores.id` | ❌ **NO** | Menu categories are universal HQ-managed |
| `MenuItem` | `NOT NULL` FK `stores.id` | ❌ **NO** | Menu items are universal HQ-managed |
| `InventoryItem` | `NOT NULL` FK `stores.id` | ✅ **YES** | Physical stock per store |
| `InventoryCategory` | `NOT NULL` FK `stores.id` | ✅ **YES** | Inventory categories can be per-store |
| `InventoryMovement` | `NOT NULL` FK `stores.id` | ✅ **YES** | Stock movements happen at a store |

### The `store_id=0` Virtual Store Workaround

The HQ virtual store exists solely because `MenuCategory.store_id` and `MenuItem.store_id` are `NOT NULL`. Without this constraint, the HQ store would not be needed at all for menu management.

```python
# Current workaround in pwa/menu.py
UNIVERSAL_MENU_STORE_ID = 0

@router.get("/categories")
async def list_categories(store_id: int, db: AsyncSession = Depends(get_db)):
    # Parameter store_id is IGNORED — always query HQ
    result = await db.execute(
        select(MenuCategory)
        .where(MenuCategory.store_id == UNIVERSAL_MENU_STORE_ID)  # ← hardcoded
    )
```

This is a code smell. The path parameter `store_id` is meaningless for menu endpoints.

---

## Refactor Plan

### Goal
Make the database schema match the business reality: **menu is universal**. Remove `store_id` from `MenuCategory` and `MenuItem`.

### Phase 1: Database Migration

**Migration: `apr2026_universal_menu_v7.py`**

1. **Drop FK constraint & index** on `menu_categories.store_id`
2. **Remove** `menu_categories.store_id` column
3. **Drop FK constraint & index** on `menu_items.store_id`
4. **Remove** `menu_items.store_id` column
5. **Drop composite index** `ix_menu_store_cat_avail`
6. **Create new index** `ix_menu_cat_avail` on `(category_id, is_available)`
7. **Update data**: any existing menu rows with `store_id != 0` are migrated (currently all are `0`)

```python
# Alembic migration skeleton
from alembic import op
import sqlalchemy as sa

# upgrade
def upgrade():
    # menu_categories
    op.drop_index('ix_menu_categories_store_id', table_name='menu_categories')
    op.drop_constraint('menu_categories_store_id_fkey', 'menu_categories', type_='foreignkey')
    op.drop_column('menu_categories', 'store_id')

    # menu_items
    op.drop_index('ix_menu_items_store_id', table_name='menu_items')
    op.drop_constraint('menu_items_store_id_fkey', 'menu_items', type_='foreignkey')
    op.drop_column('menu_items', 'store_id')
    op.drop_index('ix_menu_store_cat_avail', table_name='menu_items')
    op.create_index('ix_menu_cat_avail', 'menu_items', ['category_id', 'is_available'])
```

### Phase 2: Model Updates (`backend/app/models/menu.py`)

```python
class MenuCategory(Base):
    __tablename__ = "menu_categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # REMOVED: store_id
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # ... rest unchanged
    # REMOVED: store relationship
    items: Mapped[List["MenuItem"]] = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan")

class MenuItem(Base):
    __tablename__ = "menu_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # REMOVED: store_id
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("menu_categories.id"), nullable=False, index=True)
    # ... rest unchanged
    __table_args__ = (
        CheckConstraint("base_price >= 0", name="ck_menu_items_base_price"),
        Index("ix_menu_cat_avail", "category_id", "is_available"),  # NEW
    )
    # REMOVED: store relationship
    category: Mapped["MenuCategory"] = relationship("MenuCategory", back_populates="items")
```

**Also update `Store` model** (`backend/app/models/store.py`) — remove `categories` and `items` relationships from `Store`.

### Phase 3: API Endpoint Updates

#### PWA Menu (`backend/app/api/v1/endpoints/pwa/menu.py`)

Remove the fake `store_id` path parameter from menu routes:

```python
# BEFORE
router = APIRouter(prefix="/stores/{store_id}", tags=["Menu"])

@router.get("/categories")
async def list_categories(store_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MenuCategory).where(MenuCategory.store_id == UNIVERSAL_MENU_STORE_ID)
    )

# AFTER
router = APIRouter(prefix="/menu", tags=["Menu"])

@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuCategory))
```

Same for `/items`, `/items/search`, `/items/popular`, `/items/{item_id}/customizations`.

#### PWA Cart (`backend/app/api/v1/endpoints/pwa/cart.py`)

The cart `store_id` represents **the order's fulfillment store**, not the menu item's store. This is correct and should stay. But remove the `store_id != 0` validation logic that checks menu item store matching:

```python
# BEFORE
cart_result = await db.execute(select(CartItem).where(CartItem.user_id == user.id))
cart_items = cart_result.scalars().all()
if existing_items and existing_items[0].store_id != req.store_id:
    raise HTTPException(400, "Cart contains items from a different store...")

# Menu item lookup — NO store filter needed
item_result = await db.execute(select(MenuItem).where(MenuItem.id == req.item_id))
```

This is already correct (no store filter on menu item lookup). The cart `store_id` is purely about which physical store fulfills the order.

#### Admin Menu Management (`backend/app/api/v1/endpoints/admin/admin_menu_management.py`)

Remove `store_id` from all routes and queries:

```python
# BEFORE
@router.post("/stores/{store_id}/categories")
async def create_category(store_id: int, req: CategoryCreate, ...):
    cat = MenuCategory(store_id=store_id, name=req.name, ...)

# AFTER
@router.post("/categories")
async def create_category(req: CategoryCreate, ...):
    cat = MenuCategory(name=req.name, ...)
```

Same for items: `/items`, `/items/{item_id}`.

### Phase 4: Frontend Updates

#### PWA API calls

Update `customer-app/src/lib/api.ts` and all components that call menu endpoints:

```typescript
// BEFORE
api.get(`/stores/${storeId}/items`, ...)
api.get(`/stores/${storeId}/categories`)

// AFTER
api.get(`/menu/items`, ...)
api.get(`/menu/categories`)
```

Files to update:
- `HomePage.tsx` (`loadFeatured`, `loadCustomizations`)
- `MenuPage.tsx` (`loadMenu`, `loadCustomizations`)
- `api.ts` (type definitions if any)

**Cart calls stay unchanged** — cart still passes `storeId` because that represents the order fulfillment store, which is correct.

### Phase 5: Documentation Updates

Update these docs after refactor:
- `02-database-schema.md` — remove `store_id` from menu tables
- `03-api-reference.md` — update menu endpoint paths
- `02e-orders.md` — clarify cart `store_id` = fulfillment store, not menu store
- `06-improvements-log.md` — log this refactor

---

## Files Affected

| File | Change |
|---|---|
| `backend/app/models/menu.py` | Remove `store_id` from `MenuCategory`, `MenuItem`; update indexes |
| `backend/app/models/store.py` | Remove `categories`, `items` back-populates from `Store` |
| `backend/app/api/v1/endpoints/pwa/menu.py` | Remove `store_id` path param; remove `UNIVERSAL_MENU_STORE_ID` |
| `backend/app/api/v1/endpoints/pwa/cart.py` | Remove any menu store_id validation (if present) |
| `backend/app/api/v1/endpoints/admin/admin_menu_management.py` | Remove `store_id` from all routes/queries |
| `backend/app/api/v1/endpoints/admin/admin_customizations.py` | Remove `store_id` path param from customization routes |
| `customer-app/src/components/HomePage.tsx` | Update API paths to `/menu/...` |
| `customer-app/src/components/MenuPage.tsx` | Update API paths to `/menu/...` |
| `customer-app/src/lib/api.ts` | Update endpoint path constants |
| `alembic/versions/apr2026_universal_menu_v7.py` | New migration |
| `docs/02-database-schema.md` | Update schema docs |
| `docs/03-api-reference.md` | Update endpoint docs |

---

## What Does NOT Change

These correctly use `store_id` and must stay as-is:

| Feature | Why `store_id` stays |
|---|---|
| **Cart `store_id`** | Records which physical store fulfills the order |
| **Order `store_id`** | The store that prepared & served the order |
| **Inventory tables** | Physical stock is per-store |
| **Staff `store_id`** | Staff are assigned to specific stores |
| **Table `store_id`** | Tables exist at specific stores |
| **Store picker in checkout** | User chooses fulfillment store for pickup/delivery |
| **Delivery radius / fee** | Per-store configuration |

---

## Status: ✅ EXECUTED

All changes have been applied:
1. ✅ Alembic migration `apr2026_universal_menu_v7` created and run
2. ✅ SQLAlchemy models updated (`menu.py`, `store.py`)
3. ✅ Pydantic schemas updated (`MenuCategoryOut`, `MenuItemOut`)
4. ✅ PWA API endpoints updated (`/menu/...`)
5. ✅ Admin API endpoints updated (`/admin/...`)
6. ✅ Frontend API calls updated (customer-app + admin)
7. ✅ Documentation updated
8. ✅ Backend imports verified
9. ✅ Frontend lint/build pass (0 errors, 0 warnings)

This was a **breaking API change**. All callers have been updated.
