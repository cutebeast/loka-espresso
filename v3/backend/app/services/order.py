"""Order service layer."""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect as sa_inspect, select, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from decimal import Decimal

from app.core.money import money_round, to_decimal
from app.models.cart import CartLineItem, CustomerCart
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
from app.models.menu import MenuCategory, MenuItem, MenuItemRecipe, MenuVariant
from app.models.order import Order, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.staff import TipAllocation
from app.models.store import Store, StoreConfiguration
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.bundle_product import BundleProduct, BundleProductComponent, BundleGroup
from app.schemas.order import OrderCreate
from app.services.bundle_types import resolve_bundle_mechanic
from app.services.platform_config import PlatformConfigService


class OrderError(Exception):
    """Order-related error."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _consumed_items_price(bundle_items: list, consume_qty: int) -> Decimal:
    """Return the regular price of ``consume_qty`` bundle items.

    Consumes the highest unit-total lines first to maximize the customer-facing
    discount while staying deterministic.  ``bundle_items`` may be
    ``CartLineItem`` objects or anything exposing ``quantity``, ``unit_price``
    and ``modifier_total``.
    """
    if consume_qty <= 0 or not bundle_items:
        return Decimal(0)
    sorted_items = sorted(
        bundle_items,
        key=lambda ci: to_decimal(ci.unit_price) + to_decimal(ci.modifier_total),
        reverse=True,
    )
    remaining = consume_qty
    total = Decimal(0)
    for ci in sorted_items:
        if remaining <= 0:
            break
        take = min(ci.quantity, remaining)
        unit_total = to_decimal(ci.unit_price) + to_decimal(ci.modifier_total)
        total += unit_total * take
        remaining -= take
    return total


async def _compute_bundle_discount(db: AsyncSession, cart_items: list[CartLineItem]) -> tuple[Decimal, set[int]]:
    """Compute bundle discount and return active bundle ids for add-on deals.

    Validates component membership, active/deleted/date-window status, and
    bundle-type constraints. Invalid configurations simply receive no bundle
    discount. Discount sets are capped by ``max_per_order``. Only the items
    that actually form complete sets are discounted; extras are charged at
    regular price.
    """
    bundle_discount = Decimal(0)
    active_bundle_ids: set[int] = set()
    bundle_ids_in_cart = {ci.bundle_product_id for ci in cart_items if ci.bundle_product_id}
    if not bundle_ids_in_cart:
        return bundle_discount, active_bundle_ids

    now = datetime.now(timezone.utc)

    for bid in bundle_ids_in_cart:
        bundle = await db.get(BundleProduct, bid)
        if not bundle or not bundle.is_active or bundle.deleted_at is not None:
            continue
        if (bundle.start_date and now < bundle.start_date) or (bundle.end_date and now > bundle.end_date):
            continue

        bundle_items = [ci for ci in cart_items if ci.bundle_product_id == bid]

        # Load components for membership validation
        components_result = await db.execute(
            select(BundleProductComponent).where(
                BundleProductComponent.bundle_product_id == bid
            )
        )
        comp_map = {c.id: c for c in components_result.scalars().all()}
        if not comp_map:
            continue

        membership_ok = True
        for ci in bundle_items:
            if ci.bundle_component_id:
                comp = comp_map.get(ci.bundle_component_id)
                if not comp or comp.menu_item_id != ci.menu_item_id:
                    membership_ok = False
                    break
        if not membership_ok:
            continue

        bundle_price = to_decimal(bundle.bundle_price)

        num_sets = 0
        bundled_sum = Decimal(0)
        # Branch on the mechanic behind the type key so admin-invented
        # bundle types behave like the mechanic they were assigned.
        mechanic = await resolve_bundle_mechanic(db, bundle.bundle_type)
        if mechanic == "multi_course":
            groups_result = await db.execute(
                select(BundleGroup)
                .where(BundleGroup.bundle_product_id == bid)
                .options(selectinload(BundleGroup.components))
                .order_by(BundleGroup.sort_order)
            )
            groups = groups_result.scalars().all()
            if groups:
                component_group_map = {}
                for g in groups:
                    for c in g.components:
                        component_group_map[c.id] = g

                group_qtys: dict[int, int] = {}
                for ci in bundle_items:
                    if ci.bundle_component_id and ci.bundle_component_id in component_group_map:
                        gid = component_group_map[ci.bundle_component_id].id
                        group_qtys[gid] = group_qtys.get(gid, 0) + ci.quantity

                # Each group must satisfy its min/max pick constraints
                group_ok = True
                for g in groups:
                    qty = group_qtys.get(g.id, 0)
                    if qty < g.min_pick or qty > g.max_pick:
                        group_ok = False
                        break
                if group_ok:
                    pick_counts = [group_qtys.get(g.id, 0) // g.pick_count for g in groups if g.pick_count > 0]
                    num_sets = min(pick_counts) if pick_counts else 0
                    num_sets = min(num_sets, bundle.max_per_order)
                    for g in groups:
                        group_lines = [
                            ci for ci in bundle_items
                            if ci.bundle_component_id and ci.bundle_component_id in {c.id for c in g.components}
                        ]
                        bundled_sum += _consumed_items_price(group_lines, num_sets * g.pick_count)

        elif mechanic == "pick_x" and bundle.pick_count and bundle.pick_count > 0:
            component_qtys: dict[int | str, int] = {}
            for ci in bundle_items:
                key = ci.bundle_component_id or ci.menu_item_id
                component_qtys[key] = component_qtys.get(key, 0) + ci.quantity
            distinct_count = len(component_qtys)

            if bundle.allow_duplicates or distinct_count >= bundle.pick_count:
                max_sets_by_total = sum(ci.quantity for ci in bundle_items) // bundle.pick_count
                if not bundle.allow_duplicates:
                    # Each distinct component may be used at most once per set
                    max_sets_by_component = min(component_qtys.values()) if component_qtys else 0
                    num_sets = min(max_sets_by_total, max_sets_by_component)
                else:
                    num_sets = max_sets_by_total
                num_sets = min(num_sets, bundle.max_per_order)
                bundled_sum = _consumed_items_price(bundle_items, num_sets * bundle.pick_count)

        else:
            # Standard / fixed / value / combo bundles: every required component
            # must be present in the quantity needed per set (default_quantity).
            required_ids = set(comp_map.keys())
            qty_per_required: dict[int, int] = {cid: 0 for cid in required_ids}
            for ci in bundle_items:
                if ci.bundle_component_id and ci.bundle_component_id in qty_per_required:
                    qty_per_required[ci.bundle_component_id] += ci.quantity
                elif not ci.bundle_component_id:
                    # Legacy fallback: match by menu_item_id
                    for comp in comp_map.values():
                        if comp.menu_item_id == ci.menu_item_id:
                            qty_per_required[comp.id] += ci.quantity

            set_counts = []
            complete = True
            for cid, comp in comp_map.items():
                per_set = comp.default_quantity or 1
                if qty_per_required[cid] < per_set:
                    complete = False
                    break
                set_counts.append(qty_per_required[cid] // per_set)
            if complete and set_counts:
                num_sets = min(set_counts)
                num_sets = min(num_sets, bundle.max_per_order)
                for cid, comp in comp_map.items():
                    per_set = comp.default_quantity or 1
                    comp_lines = [
                        ci for ci in bundle_items
                        if ci.bundle_component_id == cid
                        or (
                            not ci.bundle_component_id
                            and comp.menu_item_id == ci.menu_item_id
                        )
                    ]
                    bundled_sum += _consumed_items_price(comp_lines, num_sets * per_set)

        # Apply discount only for items that actually form complete sets
        if num_sets > 0:
            active_bundle_ids.add(bid)
            disc = bundled_sum - (bundle_price * num_sets)
            if disc > 0:
                bundle_discount += disc

    return bundle_discount, active_bundle_ids


def _build_order_out(order: Order):
    """Build OrderOut from Order model without lazy loading.
    Shared utility used by admin and customer order endpoints."""
    from app.schemas.order import OrderOut
    order_dict = {c: getattr(order, c) for c in order.__table__.columns.keys()}
    # Merge fulfillment fields only when the relationship is already loaded.
    # In async SQLAlchemy, touching an unloaded relationship after the session
    # has closed raises MissingGreenlet; we avoid that by checking load state.
    insp = sa_inspect(order)
    if "fulfillment" not in insp.unloaded:
        fulfillment = order.fulfillment
        if fulfillment:
            order_dict.setdefault("delivery_address", fulfillment.delivery_address_snapshot)
            order_dict.setdefault("recipient_name", fulfillment.recipient_name)
            order_dict.setdefault("recipient_phone", fulfillment.recipient_phone)
    return OrderOut.model_validate(order_dict)


def generate_order_number() -> str:
    """Generate a unique order number."""
    now = datetime.now(timezone.utc)
    return f"ORD-{now.strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


async def compute_estimated_ready_at(db: AsyncSession, order: Order, line_items: list) -> datetime:
    """Honest pickup estimate for the ETA card: longest item prep time plus a
    queue buffer derived from the store's current in-progress orders (capped).
    A customer-scheduled pickup_time always wins. Not persisted — the queue
    moves, so the estimate is computed at read time.
    """
    if order.pickup_time:
        return order.pickup_time
    menu_ids = [li.menu_item_id for li in line_items]
    max_prep = 10
    if menu_ids:
        prep_result = await db.execute(
            select(func.max(MenuItem.prep_time_minutes)).where(MenuItem.id.in_(menu_ids))
        )
        max_prep = prep_result.scalar() or 10
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    queue_result = await db.execute(
        select(func.count(Order.id)).where(
            Order.store_id == order.store_id,
            Order.status.in_(("confirmed", "preparing")),
            Order.created_at >= today_start,
        )
    )
    queue_count = queue_result.scalar() or 0
    return datetime.now(timezone.utc) + timedelta(minutes=max_prep + min(queue_count * 2, 30))


async def _deduct_stock_for_order(
    db: AsyncSession,
    order: Order,
    line_items: list,
) -> list[str]:
    """Deduct inventory stock based on menu item recipes for an order.

    `line_items` should be objects with `menu_item_id`, `menu_variant_id`, and
    `quantity` attributes.

    Business decision (2026-08-07): a sale is NEVER blocked by stock — the
    counter can't refuse a paying customer because opening stock wasn't keyed.
    Stock is deducted in full and may go negative; a warning string per
    affected item is returned for the caller to surface/log.
    """
    warnings: list[str] = []
    recipe_needs = await _compute_recipe_needs(db, line_items)
    if not recipe_needs:
        return warnings

    inv_item_result = await db.execute(
        select(InventoryItem).where(InventoryItem.id.in_(list(recipe_needs.keys())))
    )
    inv_items = {inv.id: inv for inv in inv_item_result.scalars().all()}

    recipe_needs = {inv_id: qty for inv_id, qty in recipe_needs.items() if inv_id in inv_items}
    if not recipe_needs:
        return warnings

    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id.in_(list(recipe_needs.keys())),
            InventoryStock.store_id == order.store_id,
        ).with_for_update()
    )
    stock_map = {s.inventory_item_id: s for s in stock_result.scalars().all()}

    for inv_id in recipe_needs:
        if inv_id not in stock_map:
            stock = InventoryStock(
                inventory_item_id=inv_id,
                store_id=order.store_id,
                current_stock=0,
                reserved_stock=0,
            )
            db.add(stock)
            stock_map[inv_id] = stock

    for inv_id, qty_needed in recipe_needs.items():
        stock = stock_map[inv_id]
        inv = inv_items[inv_id]
        old_stock = Decimal(str(stock.current_stock))
        new_stock = old_stock - qty_needed
        stock.current_stock = new_stock
        if new_stock < 0:
            warnings.append(
                f"Stock for {inv.item_name} is now {new_stock:.3f} {inv.unit_of_measure} — please key in opening stock or receive a purchase order"
            )
        db.add(InventoryMovementLog(
            store_id=order.store_id,
            inventory_item_id=inv_id,
            movement_type="out",
            quantity_delta=-Decimal(str(qty_needed)),
            stock_after=Decimal(str(new_stock)),
            reserved_delta=0,
            reserved_after=stock.reserved_stock,
            reason=f"Order {order.order_number} stock deduction",
            reference_type="order",
            reference_id=order.id,
            unit_cost_at_movement=inv.unit_cost if inv.unit_cost is not None else None,
            movement_cost=qty_needed * Decimal(str(inv.unit_cost or 0)),
        ))

    return warnings


async def _compute_recipe_needs(db: AsyncSession, line_items: list) -> dict[int, Decimal]:
    """Aggregate required inventory quantities from menu item recipes.

    `line_items` should be objects with `menu_item_id`, `menu_variant_id`, and
    `quantity` attributes. Shared by stock deduction and restoration.
    """
    # Batch recipe lookup by (menu_item_id, menu_variant_id) to avoid N+1.
    recipe_keys = set()
    for li in line_items:
        mv_id = getattr(li, "menu_variant_id", None)
        recipe_keys.add((li.menu_item_id, mv_id))

    if recipe_keys:
        menu_item_ids = {mid for mid, _ in recipe_keys}
        menu_variant_ids = {mv_id for _, mv_id in recipe_keys if mv_id is not None}
        recipe_result = await db.execute(
            select(MenuItemRecipe).where(
                MenuItemRecipe.menu_item_id.in_(menu_item_ids),
                (
                    MenuItemRecipe.menu_variant_id.in_(menu_variant_ids)
                    | MenuItemRecipe.menu_variant_id.is_(None)
                ),
            )
        )
        recipes = recipe_result.scalars().all()
    else:
        recipes = []

    recipe_needs: dict[int, Decimal] = {}
    recipe_map: dict[tuple[int, int | None], list[MenuItemRecipe]] = {}
    for rc in recipes:
        recipe_map.setdefault((rc.menu_item_id, rc.menu_variant_id), []).append(rc)

    for li in line_items:
        mv_id = getattr(li, "menu_variant_id", None)
        # Prefer exact variant match; fallback to generic recipe if no variant-specific recipe exists.
        key = (li.menu_item_id, mv_id)
        li_recipes = recipe_map.get(key, [])
        if mv_id is not None and not li_recipes:
            li_recipes = recipe_map.get((li.menu_item_id, None), [])
        for rc in li_recipes:
            if rc.quantity_required is None or li.quantity is None:
                continue
            qty_needed = Decimal(str(rc.quantity_required)) * Decimal(li.quantity) * (Decimal(1) + Decimal(str(rc.waste_factor or 0)))
            recipe_needs[rc.inventory_item_id] = recipe_needs.get(rc.inventory_item_id, Decimal(0)) + qty_needed

    return recipe_needs


async def _restore_stock_for_order(
    db: AsyncSession,
    order: Order,
    line_items: list,
) -> None:
    """Restore inventory stock previously deducted for an order (cancellation).

    Mirrors `_deduct_stock_for_order` with an inbound movement.
    """
    recipe_needs = await _compute_recipe_needs(db, line_items)
    if not recipe_needs:
        return

    inv_item_result = await db.execute(
        select(InventoryItem).where(InventoryItem.id.in_(list(recipe_needs.keys())))
    )
    inv_items = {inv.id: inv for inv in inv_item_result.scalars().all()}

    recipe_needs = {inv_id: qty for inv_id, qty in recipe_needs.items() if inv_id in inv_items}
    if not recipe_needs:
        return

    stock_result = await db.execute(
        select(InventoryStock).where(
            InventoryStock.inventory_item_id.in_(list(recipe_needs.keys())),
            InventoryStock.store_id == order.store_id,
        ).with_for_update()
    )
    stock_map = {s.inventory_item_id: s for s in stock_result.scalars().all()}

    for inv_id, qty_restored in recipe_needs.items():
        stock = stock_map.get(inv_id)
        if stock is None:
            continue
        inv = inv_items[inv_id]
        new_stock = Decimal(str(stock.current_stock)) + qty_restored
        stock.current_stock = new_stock
        db.add(InventoryMovementLog(
            store_id=order.store_id,
            inventory_item_id=inv_id,
            movement_type="in",
            quantity_delta=Decimal(str(qty_restored)),
            stock_after=Decimal(str(new_stock)),
            reserved_delta=0,
            reserved_after=stock.reserved_stock,
            reason=f"Order {order.order_number} cancellation stock restoration",
            reference_type="order",
            reference_id=order.id,
            unit_cost_at_movement=inv.unit_cost if inv.unit_cost is not None else None,
            movement_cost=qty_restored * Decimal(str(inv.unit_cost or 0)),
        ))


async def _release_order_vouchers_and_rewards(db: AsyncSession, order: Order) -> None:
    """Release vouchers/rewards consumed by the order (decrementing global
    usage counters). Shared by order cancellation and full refunds."""
    cv_result = await db.execute(
        select(CustomerVoucher).where(
            CustomerVoucher.order_id == order.id,
            CustomerVoucher.status == "used",
        ).with_for_update()
    )
    for cv in cv_result.scalars().all():
        cv.status = "active"
        cv.used_at = None
        cv.order_id = None
        cv.use_count = max(0, (cv.use_count or 0) - 1)
        vd = await db.get(VoucherDefinition, cv.voucher_definition_id)
        if vd:
            vd.global_use_count = max(0, (vd.global_use_count or 0) - 1)

    cr_result = await db.execute(
        select(CustomerReward).where(
            CustomerReward.order_id == order.id,
            CustomerReward.status == "used",
        ).with_for_update()
    )
    for cr in cr_result.scalars().all():
        cr.status = "active"
        cr.used_at = None
        cr.order_id = None
        rc = await db.get(RewardCatalog, cr.reward_catalog_id)
        if rc:
            rc.total_redemptions = max(0, (rc.total_redemptions or 0) - 1)


async def reverse_order_effects(db: AsyncSession, order: Order) -> None:
    """Reverse side effects granted at order creation.

    Claws back loyalty points (negative ledger entry mirroring the award),
    releases any voucher/reward consumed by the order (decrementing global
    usage counters), restores recipe-based stock, and frees booked class
    session seats. Callers must hold a row lock on the order and manage the
    surrounding transaction/commit.
    """
    # ── Class session seats release ──
    session_lines = await db.execute(
        select(OrderLineItem).where(
            OrderLineItem.order_id == order.id,
            OrderLineItem.class_session_id.is_not(None),
        )
    )
    for line in session_lines.scalars().all():
        from app.models.class_session import ClassSession
        sess_result = await db.execute(
            select(ClassSession).where(ClassSession.id == line.class_session_id).with_for_update()
        )
        sess = sess_result.scalar_one_or_none()
        if sess is not None:
            sess.booked_pax = max(0, sess.booked_pax - line.quantity)

    # ── Loyalty points clawback ──
    points = int(order.loyalty_points_earned or 0)
    if points > 0 and order.customer_id:
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == order.customer_id).with_for_update()
        )
        la = la_result.scalar_one_or_none()
        if la:
            clawback = min(points, la.points_balance)
            if clawback > 0:
                ledger = LoyaltyPointsLedger(
                    loyalty_account_id=la.id,
                    customer_id=order.customer_id,
                    event_type="return_deduction",
                    points_delta=-clawback,
                    running_balance=la.points_balance - clawback,
                    order_id=order.id,
                    description=f"Points reversed for cancelled order {order.order_number}",
                )
                db.add(ledger)
                la.points_balance -= clawback
            la.lifetime_points_earned = max(0, (la.lifetime_points_earned or 0) - points)
            from app.services.commerce import _recalculate_tier
            await _recalculate_tier(db, la)
        order.loyalty_points_earned = 0

    # ── Voucher / reward release ──
    await _release_order_vouchers_and_rewards(db, order)

    # ── Stock restoration ──
    li_result = await db.execute(
        select(OrderLineItem).where(OrderLineItem.order_id == order.id)
    )
    line_items = li_result.scalars().all()
    if line_items:
        await _restore_stock_for_order(db, order, line_items)


async def validate_voucher_eligibility(
    db: AsyncSession,
    vd: VoucherDefinition,
    cv: CustomerVoucher,
    *,
    customer_id: int,
    store_id: int,
    menu_item_ids: set[int] | None = None,
    has_other_discount: bool = False,
    current_order_id: int | None = None,
) -> None:
    """Enforce voucher definition usage limits and scope. Raises OrderError."""
    if vd.max_global_uses is not None and (vd.global_use_count or 0) >= vd.max_global_uses:
        raise OrderError("This voucher has reached its usage limit", 400)

    if vd.max_uses_per_customer is not None:
        used_result = await db.execute(
            select(func.coalesce(func.sum(CustomerVoucher.use_count), 0)).where(
                CustomerVoucher.voucher_definition_id == vd.id,
                CustomerVoucher.customer_id == customer_id,
                CustomerVoucher.id != cv.id,
            )
        )
        used_count = int(used_result.scalar() or 0) + (cv.use_count or 0)
        if used_count >= vd.max_uses_per_customer:
            raise OrderError("You have already used this voucher the maximum number of times", 400)

    if vd.first_order_only:
        prior_filters = [
            Order.customer_id == customer_id,
            Order.deleted_at.is_(None),
            Order.status.notin_(["cancelled_by_customer", "cancelled_by_merchant"]),
        ]
        if current_order_id is not None:
            prior_filters.append(Order.id != current_order_id)
        prior_result = await db.execute(
            select(func.count(Order.id)).where(*prior_filters)
        )
        if (prior_result.scalar() or 0) > 0:
            raise OrderError("This voucher is only valid on your first order", 400)

    if not vd.stackable and has_other_discount:
        raise OrderError("This voucher cannot be combined with other discounts", 400)

    if vd.scope == "store_specific" and cv.store_id and cv.store_id != store_id:
        raise OrderError("This voucher is only valid at a specific store", 400)

    if vd.scope == "item_specific" and vd.menu_item_id is not None:
        if not menu_item_ids or vd.menu_item_id not in menu_item_ids:
            raise OrderError("This voucher requires a specific menu item in your order", 400)

    if vd.scope == "category_specific" and vd.category_id is not None:
        if not menu_item_ids:
            raise OrderError("This voucher requires an item from a specific category in your order", 400)
        cat_result = await db.execute(
            select(func.count(MenuItem.id)).where(
                MenuItem.id.in_(menu_item_ids),
                MenuItem.category_id == vd.category_id,
            )
        )
        if (cat_result.scalar() or 0) == 0:
            raise OrderError("This voucher requires an item from a specific category in your order", 400)


async def create_order_from_cart(
    db: AsyncSession,
    customer_id: int,
    data: OrderCreate,
) -> Order:
    """Create an order from a customer's cart."""
    # Fetch cart with row lock to prevent duplicate orders
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.id == data.cart_id,
            CustomerCart.customer_id == customer_id,
        ).with_for_update()
    )
    cart = cart_result.scalar_one_or_none()
    if cart is None:
        raise OrderError("Cart not found", 404)
    
    if cart.item_count == 0:
        raise OrderError("Cart is empty", 400)

    # Idempotent replay: return an existing order created with the same key
    if data.idempotency_key:
        existing_result = await db.execute(
            select(Order).where(Order.idempotency_key == data.idempotency_key)
        )
        existing_order = existing_result.scalar_one_or_none()
        if existing_order:
            # Ownership must match
            if existing_order.customer_id != customer_id:
                raise OrderError("Idempotency key belongs to another customer", 403)
            return existing_order

    # Fetch store with active check
    store_result = await db.execute(
        select(Store).where(Store.id == cart.store_id, Store.is_active.is_(True), Store.deleted_at.is_(None))
    )
    store = store_result.scalar_one_or_none()
    if store is None:
        raise OrderError("Store is not active or does not exist", 400)
    
    # Fetch line items
    items_result = await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    cart_items = items_result.scalars().all()

    # Members-only ("Vault") enforcement: menu items with minimum_tier_id
    # require the ordering customer to hold at least that loyalty tier.
    # Walk-in/guest profiles have no tier and cannot order locked items.
    # (POS orders bypass this path — staff may sell locked items in-store.)
    line_item_ids = [ci.menu_item_id for ci in cart_items]
    if line_item_ids:
        locked_result = await db.execute(
            select(MenuItem.id, MenuItem.item_name, MenuItem.minimum_tier_id).where(
                MenuItem.id.in_(line_item_ids),
                MenuItem.minimum_tier_id.isnot(None),
            )
        )
        locked_items = locked_result.all()
        if locked_items:
            la_result = await db.execute(
                select(LoyaltyAccount.current_tier_id).where(
                    LoyaltyAccount.customer_id == customer_id
                )
            )
            customer_tier_id = la_result.scalar_one_or_none()
            for _item_id, item_name, min_tier in locked_items:
                if min_tier and (customer_tier_id is None or customer_tier_id < min_tier):
                    raise OrderError(
                        f'"{item_name}" is a members-only item — unlock it by reaching a higher loyalty tier',
                        403,
                    )

    # Fetch store config for fees and admin-configured accounting precision
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    config_result = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == cart.store_id,
            StoreConfiguration.config_key.in_(["order.delivery_fee", "order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: to_decimal(c.config_value) for c in config_result.scalars().all()}
    delivery_fee = config_map.get("order.delivery_fee", Decimal(0))
    service_charge = config_map.get("order.service_charge", Decimal(0))
    tax_rate = config_map.get("order.tax_rate", Decimal(0))
    subtotal = to_decimal(cart.subtotal)
    tax_amount = money_round(subtotal * tax_rate, precision, rounding_mode)

    modifier_sub = sum(to_decimal(i.modifier_total) * i.quantity for i in cart_items)
    is_delivery = data.fulfillment_type in ("standard_delivery", "express_delivery", "third_party_delivery")
    tip = to_decimal(data.tip_amount or 0)
    total = (
        subtotal
        + (delivery_fee if is_delivery else Decimal(0))
        + service_charge
        + tax_amount
        + tip
    )

    # ── Voucher / Reward discount processing ──
    voucher_discount = Decimal(0)
    reward_discount = Decimal(0)
    voucher_used: CustomerVoucher | None = None
    reward_used: CustomerReward | None = None

    if data.voucher_code:
        voucher_result = await db.execute(
            select(CustomerVoucher).where(
                CustomerVoucher.voucher_code == data.voucher_code,
                CustomerVoucher.customer_id == customer_id,
            ).with_for_update()
        )
        cv = voucher_result.scalar_one_or_none()
        if cv is None:
            raise OrderError(f"Voucher not found: {data.voucher_code}", 400)
        if cv.status != "active":
            raise OrderError(f"Voucher is {cv.status}", 400)
        if cv.expires_at and cv.expires_at < datetime.now(timezone.utc):
            raise OrderError("Voucher has expired", 400)

        vd_result = await db.execute(
            select(VoucherDefinition).where(VoucherDefinition.id == cv.voucher_definition_id).with_for_update()
        )
        vd = vd_result.scalar_one_or_none()
        if vd is None or not vd.is_active:
            raise OrderError("Voucher definition is no longer active", 400)
        if vd.valid_from and vd.valid_from > datetime.now(timezone.utc):
            raise OrderError("Voucher is not yet valid", 400)
        if vd.valid_until and vd.valid_until < datetime.now(timezone.utc):
            raise OrderError("Voucher has expired", 400)

        if vd.minimum_tier_id:
            loyalty_result = await db.execute(
                select(LoyaltyAccount).where(
                    LoyaltyAccount.customer_id == customer_id
                )
            )
            loyalty = loyalty_result.scalar_one_or_none()
            tier_id = loyalty.current_tier_id if loyalty else None
            if tier_id is None or tier_id < vd.minimum_tier_id:
                raise OrderError("Your loyalty tier is not eligible for this voucher", 400)

        await validate_voucher_eligibility(
            db, vd, cv,
            customer_id=customer_id,
            store_id=cart.store_id,
            menu_item_ids={ci.menu_item_id for ci in cart_items},
            has_other_discount=bool(data.reward_id),
        )

        order_base = subtotal  # cart subtotal already includes modifiers
        min_order = to_decimal(vd.minimum_order_value)
        if order_base < min_order:
            raise OrderError(f"Voucher requires minimum order of {min_order:.2f}", 400)

        if vd.voucher_type == "percentage_off":
            pct = to_decimal(vd.discount_value) / Decimal(100)
            voucher_discount = money_round(order_base * pct, precision, rounding_mode)
            if vd.discount_max_amount is not None:
                voucher_discount = min(voucher_discount, to_decimal(vd.discount_max_amount))
        elif vd.voucher_type == "fixed_amount_off":
            voucher_discount = to_decimal(vd.discount_value)
        elif vd.voucher_type == "free_delivery":
            voucher_discount = delivery_fee if is_delivery else Decimal(0)
        elif vd.voucher_type == "free_item":
            if vd.menu_item_id:
                target_item_ids = [vd.menu_item_id]
            else:
                # Free the lowest-priced item in cart
                sorted_items = sorted(cart_items, key=lambda i: to_decimal(i.unit_price))
                target_item_ids = [sorted_items[0].menu_item_id] if sorted_items else []
            for li in cart_items:
                if li.menu_item_id in target_item_ids:
                    voucher_discount += to_decimal(li.unit_price) * li.quantity
                    break
            max_disc = to_decimal(vd.discount_max_amount)
            if max_disc and voucher_discount > max_disc:
                voucher_discount = max_disc

        cv.status = "used"
        cv.order_id = None  # set after order flush
        cv.used_at = datetime.now(timezone.utc)
        cv.use_count = (cv.use_count or 0) + 1
        vd.global_use_count = (vd.global_use_count or 0) + 1
        voucher_used = cv

    if data.reward_id:
        reward_result = await db.execute(
            select(CustomerReward).where(
                CustomerReward.id == data.reward_id,
                CustomerReward.customer_id == customer_id,
            ).with_for_update()
        )
        cr = reward_result.scalar_one_or_none()
        if cr is None:
            raise OrderError(f"Reward not found for this customer: id={data.reward_id}", 400)
        if cr.status != "active":
            raise OrderError(f"Reward is {cr.status}", 400)
        if cr.expires_at and cr.expires_at < datetime.now(timezone.utc):
            raise OrderError("Reward has expired", 400)

        rc_result = await db.execute(
            select(RewardCatalog).where(RewardCatalog.id == cr.reward_catalog_id).with_for_update()
        )
        rc = rc_result.scalar_one_or_none()
        if rc is None or not rc.is_active:
            raise OrderError("Reward catalog is no longer active", 400)

        order_base = subtotal  # cart subtotal already includes modifiers
        min_order = to_decimal(rc.minimum_order_value)
        if order_base < min_order:
            raise OrderError(f"Reward requires minimum order of {min_order:.2f}", 400)

        if rc.reward_type == "percentage_discount":
            pct = to_decimal(rc.discount_value) / Decimal(100)
            reward_discount = money_round(order_base * pct, precision, rounding_mode)
            if rc.discount_max_amount is not None:
                reward_discount = min(reward_discount, to_decimal(rc.discount_max_amount))
        elif rc.reward_type == "fixed_discount":
            reward_discount = to_decimal(rc.discount_value)
        elif rc.reward_type == "free_delivery":
            reward_discount = delivery_fee if is_delivery else Decimal(0)

        cr.status = "used"
        cr.order_id = None  # set after order flush
        cr.used_at = datetime.now(timezone.utc)
        rc.total_redemptions = (rc.total_redemptions or 0) + 1
        reward_used = cr

    # ── Bundle Deal discount processing ──
    bundle_discount, active_bundle_ids = await _compute_bundle_discount(db, cart_items)

    # ── Add-on Deal discount processing ──
    addon_discount = Decimal(0)
    if active_bundle_ids:
        all_menu_item_ids = set(ci.menu_item_id for ci in cart_items)
        mi_result = await db.execute(
            select(MenuItem).where(MenuItem.id.in_(all_menu_item_ids))
        )
        menu_items_map = {mi.id: mi for mi in mi_result.scalars().all()}
        for ci in cart_items:
            if ci.bundle_product_id is not None:
                continue
            mi = menu_items_map.get(ci.menu_item_id)
            if not mi or not mi.is_addon_deal_eligible:
                continue
            if not mi.eligible_bundle_ids:
                continue
            if not active_bundle_ids.intersection(set(mi.eligible_bundle_ids)):
                continue
            line_unit = to_decimal(ci.unit_price) + to_decimal(ci.modifier_total)
            if mi.addon_discount_type == "percentage":
                pct = to_decimal(mi.addon_discount_value) / Decimal(100)
                disc = money_round(line_unit * pct * ci.quantity, precision, rounding_mode)
            else:  # fixed
                disc = to_decimal(mi.addon_discount_value) * ci.quantity
            disc = min(disc, line_unit * ci.quantity)
            addon_discount += disc

    total_discount = voucher_discount + reward_discount + bundle_discount + addon_discount
    total_discount = min(total_discount, total)  # never discount more than the order total
    total -= total_discount
    total = money_round(total, precision, rounding_mode)

    # Compute loyalty points earned from order subtotal
    # Read points-per-currency-unit from platform config (default: 1 point per RM1)
    ppc_val = await config_service.get("loyalty.points_per_currency")
    try:
        points_per_currency = to_decimal(ppc_val) if ppc_val else Decimal("1")
    except Exception:
        points_per_currency = Decimal("1")
    # Points earned on the pre-discount items subtotal (not on delivery/tax/tips)
    loyalty_points_earned = int(
        (to_decimal(subtotal) * points_per_currency).to_integral_value(rounding="ROUND_DOWN")
    )

    # Create order
    order = Order(
        customer_id=customer_id,
        store_id=cart.store_id,
        dining_table_id=data.dining_table_id,
        order_number=generate_order_number(),
        order_type=data.order_type,
        fulfillment_type=data.fulfillment_type,
        order_channel="mobile_app",
        status="pending",
        payment_status="initiated",
        item_count=cart.item_count,
        items_subtotal=subtotal,
        modifier_subtotal=modifier_sub,
        delivery_fee=delivery_fee if is_delivery else Decimal(0),
        service_charge=service_charge,
        tax_amount=tax_amount,
        discount_amount=total_discount,
        voucher_discount=voucher_discount,
        reward_discount=reward_discount,
        addon_discount=addon_discount,
        tip_amount=tip,
        total_amount=total,
        total_amount_currency=store.currency_code,
        loyalty_points_earned=loyalty_points_earned,
        loyalty_points_redeemed=0,
        is_byot=bool(getattr(data, "is_byot", False)),
        customer_notes=data.customer_notes,
        delivery_instructions=data.delivery_instructions,
        pickup_time=data.pickup_time,
        idempotency_key=data.idempotency_key,
    )
    db.add(order)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Duplicate idempotency key from a concurrent request
        await db.rollback()
        if data.idempotency_key:
            existing_result = await db.execute(
                select(Order).where(Order.idempotency_key == data.idempotency_key)
            )
            existing_order = existing_result.scalar_one_or_none()
            if existing_order:
                if existing_order.customer_id != customer_id:
                    raise OrderError("Idempotency key belongs to another customer", 403) from exc
                return existing_order
        raise

    # Link used voucher/reward to this order
    if voucher_used:
        voucher_used.order_id = order.id
    if reward_used:
        reward_used.order_id = order.id
    
    # Build item/variant snapshots
    menu_item_ids = {ci.menu_item_id for ci in cart_items}
    variant_ids = {ci.menu_variant_id for ci in cart_items if ci.menu_variant_id}
    items_result = await db.execute(select(MenuItem).where(MenuItem.id.in_(menu_item_ids)))
    items_map = {mi.id: mi for mi in items_result.scalars().all()}
    variants_map = {}
    if variant_ids:
        variants_result = await db.execute(select(MenuVariant).where(MenuVariant.id.in_(variant_ids)))
        variants_map = {mv.id: mv for mv in variants_result.scalars().all()}

    # Load bundle display metadata for snapshots
    bundle_ids = {ci.bundle_product_id for ci in cart_items if ci.bundle_product_id}
    bundle_map: dict[int, BundleProduct] = {}
    bundle_comp_map: dict[tuple[int, int], BundleProductComponent] = {}
    bundle_group_map: dict[tuple[int, int], BundleGroup] = {}
    if bundle_ids:
        bp_result = await db.execute(select(BundleProduct).where(BundleProduct.id.in_(bundle_ids)))
        bundle_map = {bp.id: bp for bp in bp_result.scalars().all()}
        bcomp_result = await db.execute(
            select(BundleProductComponent).where(BundleProductComponent.bundle_product_id.in_(bundle_ids))
        )
        bundle_comp_map = {(c.bundle_product_id, c.id): c for c in bcomp_result.scalars().all()}
        bgroup_result = await db.execute(
            select(BundleGroup).where(BundleGroup.bundle_product_id.in_(bundle_ids))
        )
        bundle_group_map = {(g.bundle_product_id, g.id): g for g in bgroup_result.scalars().all()}

    # Create order line items
    for ci in cart_items:
        item = items_map.get(ci.menu_item_id)
        variant = variants_map.get(ci.menu_variant_id) if ci.menu_variant_id else None
        bundle = bundle_map.get(ci.bundle_product_id) if ci.bundle_product_id else None
        comp = bundle_comp_map.get((ci.bundle_product_id, ci.bundle_component_id)) if ci.bundle_product_id and ci.bundle_component_id else None
        group = bundle_group_map.get((comp.bundle_product_id, comp.bundle_group_id)) if comp and comp.bundle_group_id else None
        item_snapshot = {
            "item_name": item.item_name if item else None,
            "item_code": item.item_code if item else None,
            "image_url": item.image_url if item else None,
            "base_price": str(item.base_price) if item else None,
            "variant_name": variant.variant_name if variant else None,
            "variant_price_adjustment": str(variant.price_adjustment) if variant else None,
            "bundle_product_id": ci.bundle_product_id,
            "bundle_component_id": ci.bundle_component_id,
            "bundle_title": bundle.title if bundle else None,
            "bundle_component_name": item.item_name if item else None,
            "bundle_group_label": group.group_label if group else None,
        }
        oli = OrderLineItem(
            order_id=order.id,
            menu_item_id=ci.menu_item_id,
            menu_variant_id=ci.menu_variant_id,
            item_snapshot=item_snapshot,
            quantity=ci.quantity,
            unit_price=ci.unit_price,
            modifier_total=ci.modifier_total,
            line_total=ci.line_total,
            selected_modifiers=ci.selected_modifiers,
            special_instructions=ci.special_instructions,
            bundle_product_id=ci.bundle_product_id,
            bundle_component_id=ci.bundle_component_id,
            class_session_id=ci.class_session_id,
        )
        db.add(oli)

    # Consume class session seats (locked; fails the whole order when full)
    # First the hard guarantee: workshop items must carry a session — the PWA
    # enforces this in the UI, this catches any other client.
    exp_cat_result = await db.execute(
        select(MenuCategory.id).where(MenuCategory.slug == "experiences")
    )
    exp_cat_id = exp_cat_result.scalar_one_or_none()
    if exp_cat_id is not None:
        for ci in cart_items:
            item = items_map.get(ci.menu_item_id)
            if item and item.category_id == exp_cat_id and not ci.class_session_id:
                raise OrderError(
                    f"“{item.item_name}” is a class — please select a session before checkout", 400
                )
    for ci in cart_items:
        if not ci.class_session_id:
            continue
        from app.services.class_sessions import ClassSessionError, consume_session_seats
        try:
            await consume_session_seats(
                db,
                menu_item_id=ci.menu_item_id,
                class_session_id=ci.class_session_id,
                quantity=ci.quantity,
            )
        except ClassSessionError as e:
            raise OrderError(e.detail, e.status_code)

    # Deduct recipe-based stock (never blocks; warnings logged for ops review)
    stock_warnings = await _deduct_stock_for_order(db, order, cart_items)
    for w in stock_warnings:
        import logging
        logging.getLogger("app.stock").warning("order %s: %s", order.order_number, w)

    # Create initial status log
    reason_parts = ["Order created"]
    if voucher_used:
        reason_parts.append(f"voucher {data.voucher_code} applied ({voucher_discount:.2f})")
    if reward_used:
        reason_parts.append(f"reward #{data.reward_id} applied ({reward_discount:.2f})")
    if bundle_discount > 0:
        reason_parts.append(f"bundle discount ({bundle_discount:.2f})")
    if addon_discount > 0:
        reason_parts.append(f"add-on deal discount ({addon_discount:.2f})")
    status_log = OrderStatusLog(
        order_id=order.id,
        from_status=None,
        to_status="pending",
        reason="; ".join(reason_parts),
        actor_type="system",
    )
    db.add(status_log)
    
    # Create fulfillment record for delivery/pickup
    if data.fulfillment_type in ("standard_delivery", "express_delivery", "third_party_delivery", "counter_pickup", "curbside_pickup"):
        delivery_snapshot = None
        if data.delivery_address:
            delivery_snapshot = data.delivery_address if isinstance(data.delivery_address, dict) else {"address": data.delivery_address}
        fulfillment = OrderFulfillment(
            order_id=order.id,
            status="pending_assignment",
            delivery_fee_snapshot=order.delivery_fee,
            delivery_address_snapshot=delivery_snapshot,
            recipient_name=data.recipient_name,
            recipient_phone=data.recipient_phone,
        )
        db.add(fulfillment)
    
    # Auto-create tip allocation if customer tipped
    if data.tip_amount and data.tip_amount > 0:
        tip = TipAllocation(
            order_id=order.id,
            staff_id=None,  # pooled tip, unassigned until distributed
            tip_amount=to_decimal(data.tip_amount),
            allocation_type="fixed",
        )
        db.add(tip)

    # Estimate loyalty points for display — the balance is credited only when
    # payment is captured (see _credit_order_loyalty_points in services/payment.py).
    if loyalty_points_earned > 0 and customer_id:
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update()
        )
        la = la_result.scalar_one_or_none()
        if la:
            # Apply the customer's current tier points multiplier
            multiplier = Decimal(1)
            tier = None
            if la.current_tier_id:
                tier = await db.get(LoyaltyTier, la.current_tier_id)
                if tier and tier.is_active:
                    multiplier = to_decimal(tier.points_multiplier)
            if order.is_byot:
                # Eco-campaign (BYOT): 2x points (Bloom/Origin), 3x (Reserve) — replaces tier multiplier
                multiplier = Decimal(3) if (tier and tier.tier_key == "reserve") else Decimal(2)
            # Double points during the customer's birthday month (all tiers)
            from app.services.commerce import _birthday_points_multiplier, grant_birthday_perk
            birthday_mult = await _birthday_points_multiplier(db, customer_id)
            multiplier = multiplier * birthday_mult
            if birthday_mult > 1:
                # Birthday perk voucher (Origin: drink upgrade / Reserve: gift), once per year
                await grant_birthday_perk(db, customer_id, tier.tier_key if tier else None)
            if multiplier > 1:
                loyalty_points_earned = int(
                    (Decimal(loyalty_points_earned) * multiplier).to_integral_value(rounding="ROUND_DOWN")
                )
                order.loyalty_points_earned = loyalty_points_earned

    # Track order count + referral conversion (first order converts a pending referral)
    if customer_id:
        from app.models.customer import Customer
        from app.models.customer import ReferralEvent
        cust = await db.get(Customer, customer_id)
        if cust is not None:
            prior_orders = cust.order_count or 0
            cust.order_count = prior_orders + 1
            if prior_orders == 0:
                await db.execute(
                    update(ReferralEvent)
                    .where(
                        ReferralEvent.invitee_customer_id == customer_id,
                        ReferralEvent.status == "pending",
                    )
                    .values(status="converted", converted_at=datetime.now(timezone.utc))
                )

    # Clear the cart
    for ci in cart_items:
        await db.delete(ci)
    cart.item_count = 0
    cart.subtotal = Decimal("0")
    
    await db.commit()
    await db.refresh(order)
    return order


async def get_customer_orders(
    db: AsyncSession,
    customer_id: int,
    status: str | None = None,
    store_id: int | None = None,
    page: int = 1,
    per_page: int = 20,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """List orders for a customer."""
    from sqlalchemy import func

    base_filters = [
        Order.customer_id == customer_id,
        Order.deleted_at.is_(None),
    ]
    if store_id is not None:
        base_filters.append(Order.store_id == store_id)
    if date_from:
        base_filters.append(Order.created_at >= date_from)
    if date_to:
        base_filters.append(Order.created_at <= date_to + "T23:59:59")
    if status:
        # Support comma-separated status lists (e.g. "pending,preparing,ready")
        # Filter to valid enum values to avoid PostgreSQL InvalidTextRepresentationError.
        VALID_STATUSES = {
            "pending", "confirmed", "preparing", "ready_for_pickup",
            "out_for_delivery", "delivered", "cancelled_by_customer",
            "cancelled_by_merchant", "refunded", "partially_refunded", "disputed",
        }
        status_list = [s.strip() for s in status.split(",") if s.strip() and s.strip() in VALID_STATUSES]
        if len(status_list) == 1:
            base_filters.append(Order.status == status_list[0])
        elif len(status_list) > 1:
            base_filters.append(Order.status.in_(status_list))

    stmt = select(Order).options(
        selectinload(Order.line_items),
        selectinload(Order.store),
    ).where(*base_filters).order_by(Order.created_at.desc())

    count_stmt = select(func.count(Order.id)).where(*base_filters)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orders = result.scalars().all()
    return orders, total
