"""Order service layer."""

import secrets
from datetime import datetime, timezone

from sqlalchemy import inspect as sa_inspect, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from decimal import Decimal

from app.core.money import money_round, to_decimal
from app.models.cart import CartLineItem, CustomerCart
from app.models.inventory import InventoryItem, InventoryMovementLog, InventoryStock
from app.models.loyalty import LoyaltyAccount
from app.models.menu import MenuItem, MenuItemRecipe, MenuVariant
from app.models.order import Order, OrderFulfillment, OrderLineItem, OrderStatusLog
from app.models.reward import CustomerReward, RewardCatalog
from app.models.staff import TipAllocation
from app.models.store import Store, StoreConfiguration
from app.models.voucher import CustomerVoucher, VoucherDefinition
from app.models.bundle_product import BundleProduct, BundleProductComponent, BundleGroup
from app.schemas.order import OrderCreate
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
        if bundle.bundle_type == "multi_course":
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

        elif bundle.bundle_type == "pick_x" and bundle.pick_count and bundle.pick_count > 0:
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


async def _deduct_stock_for_order(
    db: AsyncSession,
    order: Order,
    line_items: list,
) -> None:
    """Deduct inventory stock based on menu item recipes for an order.

    `line_items` should be objects with `menu_item_id`, `menu_variant_id`, and `quantity` attributes.
    """
    from sqlalchemy import select, func

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
        current = Decimal(str(stock.current_stock))
        if current < qty_needed:
            inv = inv_items[inv_id]
            raise OrderError(f"Insufficient stock for {inv.item_name}: need {float(qty_needed):.3f}, have {float(current):.3f}", 400)

    for inv_id, qty_needed in recipe_needs.items():
        stock = stock_map[inv_id]
        inv = inv_items[inv_id]
        old_stock = Decimal(str(stock.current_stock))
        new_stock = old_stock - qty_needed
        stock.current_stock = new_stock
        db.add(InventoryMovementLog(
            store_id=order.store_id,
            inventory_item_id=inv_id,
            movement_type="out",
            quantity_delta=-Decimal(str(qty_needed)),
            stock_after=Decimal(str(new_stock)),
            reserved_delta=0,
            reserved_after=float(stock.reserved_stock),
            reason=f"Order {order.order_number} stock deduction",
            reference_type="order",
            reference_id=order.id,
            unit_cost_at_movement=float(inv.unit_cost) if inv.unit_cost is not None else None,
            movement_cost=float(qty_needed * Decimal(str(inv.unit_cost or 0))),
        ))


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

        order_base = subtotal  # cart subtotal already includes modifiers
        min_order = to_decimal(vd.minimum_order_value)
        if order_base < min_order:
            raise OrderError(f"Voucher requires minimum order of {float(min_order):.2f}", 400)

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
            raise OrderError(f"Reward requires minimum order of {float(min_order):.2f}", 400)

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
            "base_price": float(item.base_price) if item else None,
            "variant_name": variant.variant_name if variant else None,
            "variant_price_adjustment": float(variant.price_adjustment) if variant else None,
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
        )
        db.add(oli)

    # Deduct recipe-based stock
    await _deduct_stock_for_order(db, order, cart_items)

    # Create initial status log
    reason_parts = ["Order created"]
    if voucher_used:
        reason_parts.append(f"voucher {data.voucher_code} applied ({float(voucher_discount):.2f})")
    if reward_used:
        reason_parts.append(f"reward #{data.reward_id} applied ({float(reward_discount):.2f})")
    if bundle_discount > 0:
        reason_parts.append(f"bundle discount ({float(bundle_discount):.2f})")
    if addon_discount > 0:
        reason_parts.append(f"add-on deal discount ({float(addon_discount):.2f})")
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

    # Award loyalty points to customer
    if loyalty_points_earned > 0 and customer_id:
        la_result = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update()
        )
        la = la_result.scalar_one_or_none()
        if la:
            from app.models.loyalty import LoyaltyPointsLedger
            ledger = LoyaltyPointsLedger(
                loyalty_account_id=la.id,
                customer_id=customer_id,
                event_type="order_earned",
                points_delta=loyalty_points_earned,
                running_balance=la.points_balance + loyalty_points_earned,
                description=f"Points earned from order {order.order_number}",
            )
            db.add(ledger)
            la.points_balance += loyalty_points_earned
            la.lifetime_points_earned = (la.lifetime_points_earned or 0) + loyalty_points_earned
            # Auto-upgrade tier if applicable
            from app.services.commerce import _recalculate_tier
            await _recalculate_tier(db, la)

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
):
    """List orders for a customer."""
    from sqlalchemy import func

    base_filters = [
        Order.customer_id == customer_id,
        Order.deleted_at.is_(None),
    ]
    if store_id is not None:
        base_filters.append(Order.store_id == store_id)
    if status:
        base_filters.append(Order.status == status)

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
