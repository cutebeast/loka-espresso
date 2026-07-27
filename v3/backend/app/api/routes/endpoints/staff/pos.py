"""Staff POS endpoints (order creation, customer display state)."""

import json as _json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.deps import CurrentStaff, DBDependency, RequireStaffRole
from app.core.money import money_round, to_decimal
from app.models.customer import Customer
from app.models.menu import MenuCategory, MenuItem, MenuModifierOption
from app.models.order import Order, OrderLineItem
from app.models.payment import Payment
from app.models.staff import StaffProfile
from app.models.store import DiningTable, Store, StoreConfiguration, TableStatusSnapshot
from app.schemas.base import APIResponse
from app.schemas.staff import POSOrderCreateRequest
from app.services.order import OrderError, _compute_bundle_discount, _deduct_stock_for_order
from app.services.payment import PaymentError, _add_payment_event, create_stripe_checkout_session
from app.services.platform_config import PlatformConfigService

router = APIRouter(tags=["staff — pos"])

logger = logging.getLogger(__name__)


# ── POS Order Create ──


def _is_walkin_customer(customer_id: int) -> bool:
    """Check if customer is the system walk-in customer (no loyalty)."""
    # Walk-in customer has phone +0000000000; we check by ID at runtime
    return False  # Conservative: always try to award; _award_pos_loyalty_points handles missing account


async def _award_pos_loyalty_points(db, customer_id: int, subtotal: float, order, order_number: str) -> int:
    """Award loyalty points for a POS order, mirroring the customer flow."""
    from decimal import Decimal
    from app.models.loyalty import LoyaltyAccount, LoyaltyPointsLedger, LoyaltyTier
    from app.models.platform import PlatformConfig
    from app.services.commerce import _recalculate_tier

    # Read points-per-currency-unit from platform config
    ppc_result = await db.execute(
        select(PlatformConfig.config_value).where(PlatformConfig.config_key == "loyalty.points_per_currency")
    )
    ppc_val = ppc_result.scalar()
    try:
        points_per_currency = Decimal(str(ppc_val)) if ppc_val else Decimal("1")
    except Exception:
        points_per_currency = Decimal("1")

    points_earned = int((Decimal(str(subtotal)) * points_per_currency).to_integral_value(rounding="ROUND_DOWN"))
    if points_earned <= 0:
        return 0

    # Load loyalty account with row lock
    la_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.customer_id == customer_id).with_for_update()
    )
    la = la_result.scalar_one_or_none()
    if not la:
        return 0  # No loyalty account — skip silently

    # Apply the customer's current tier points multiplier (mirrors the customer flow)
    eco = False
    if getattr(order, "is_byot", False):
        # Eco-campaign (BYOT): 2x points (Bloom/Origin), 3x (Reserve) — replaces tier multiplier
        eco = True
        tier_key_r = await db.execute(
            select(LoyaltyTier.tier_key).where(LoyaltyTier.id == la.current_tier_id)
        ) if la.current_tier_id else None
        tier_key = tier_key_r.scalar_one_or_none() if tier_key_r else None
        points_earned = int(points_earned * (3 if tier_key == "reserve" else 2))
    elif la.current_tier_id:
        from app.models.loyalty import LoyaltyTier
        tier = await db.get(LoyaltyTier, la.current_tier_id)
        if tier and tier.is_active and tier.points_multiplier and Decimal(str(tier.points_multiplier)) > 1:
            points_earned = int(
                (Decimal(points_earned) * Decimal(str(tier.points_multiplier))).to_integral_value(rounding="ROUND_DOWN")
            )

    # Double points during the customer's birthday month (all tiers)
    from app.services.commerce import _birthday_points_multiplier, grant_birthday_perk
    birthday_mult = await _birthday_points_multiplier(db, customer_id)
    if birthday_mult > 1:
        points_earned = int(
            (Decimal(points_earned) * birthday_mult).to_integral_value(rounding="ROUND_DOWN")
        )
        # Birthday perk voucher (Origin: drink upgrade / Reserve: gift), once per year
        tier_key_r = await db.execute(
            select(LoyaltyTier.tier_key).where(LoyaltyTier.id == la.current_tier_id)
        ) if la.current_tier_id else None
        await grant_birthday_perk(db, customer_id, tier_key_r.scalar_one_or_none() if tier_key_r else None)

    ledger = LoyaltyPointsLedger(
        loyalty_account_id=la.id,
        customer_id=customer_id,
        event_type="order_earned",
        points_delta=points_earned,
        running_balance=la.points_balance + points_earned,
        description=f"Points earned from POS order {order_number}"
        + (" (BYOT eco-campaign)" if eco else "")
        + (" (birthday month double points)" if birthday_mult > 1 else ""),
    )
    db.add(ledger)
    la.points_balance += points_earned
    la.lifetime_points_earned = (la.lifetime_points_earned or 0) + points_earned
    await _recalculate_tier(db, la)

    # Update order record
    order.loyalty_points_earned = points_earned
    return points_earned


@router.post("/staff/pos/orders", status_code=status.HTTP_201_CREATED)
async def staff_pos_create_order(
    db: DBDependency,
    staff: Annotated[StaffProfile, Depends(RequireStaffRole("cashier", "server", "shift_supervisor", "store_manager"))],
    data: POSOrderCreateRequest,
    response: Response,
):
    store_id = data.store_id or staff.store_id

    # Validate store
    store_r = await db.execute(select(Store).where(Store.id == store_id, Store.deleted_at.is_(None)))
    store = store_r.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    customer_id = data.customer_id
    dining_table_id = data.dining_table_id
    order_type = data.order_type
    line_items_data = data.line_items
    payment_data = data.payment

    if not line_items_data:
        raise HTTPException(status_code=400, detail="At least one line item required")

    # Workshops/classes (experiences category) at POS: every workshop line
    # needs a session AND a real customer attached (phone is the identity
    # anchor) — the anonymous walk-in profile can't hold class bookings.
    exp_cat_r = await db.execute(select(MenuCategory.id).where(MenuCategory.slug == "experiences"))
    exp_cat_id = exp_cat_r.scalar_one_or_none()
    workshop_item_ids: set[int] = set()
    if exp_cat_id is not None:
        li_ids = {li.menu_item_id for li in line_items_data}
        wr = await db.execute(
            select(MenuItem.id).where(MenuItem.id.in_(li_ids), MenuItem.category_id == exp_cat_id)
        )
        workshop_item_ids = set(wr.scalars().all())
    has_workshop = bool(workshop_item_ids)

    if has_workshop:
        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail="Customer phone number is required for workshop bookings — attach a customer first",
            )
        for li in line_items_data:
            if li.menu_item_id in workshop_item_ids and not li.class_session_id:
                raise HTTPException(
                    status_code=400,
                    detail="Please select a session for the workshop item",
                )

    # Validate customer if provided
    if customer_id:
        cust_r = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.is_active.is_(True), Customer.deleted_at.is_(None)))
        if not cust_r.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Customer {customer_id} not found or inactive")
    else:
        # POS walk-in — find or create system walk-in customer
        walkin_r = await db.execute(select(Customer).where(Customer.phone_number == "+0000000000", Customer.deleted_at.is_(None)))
        walkin = walkin_r.scalar_one_or_none()
        if not walkin:
            walkin = Customer(phone_number="+0000000000", display_name="Walk-in", is_active=True)
            db.add(walkin)
            await db.flush()
        customer_id = walkin.id

    # Validate dining table if provided
    if dining_table_id:
        table_r = await db.execute(select(DiningTable).where(DiningTable.id == dining_table_id, DiningTable.store_id == store_id, DiningTable.deleted_at.is_(None)))
        if not table_r.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Dining table {dining_table_id} not found for store {store_id}")

    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    # Resolve prices and build line items
    subtotal = Decimal(0)
    line_items = []

    for li in line_items_data:
        menu_item_id = li.menu_item_id
        qty = max(1, li.quantity)
        special = li.special_instructions or ""

        item_r = await db.execute(select(MenuItem).where(MenuItem.id == menu_item_id, MenuItem.deleted_at.is_(None)))
        menu_item = item_r.scalar_one_or_none()
        if not menu_item:
            raise HTTPException(status_code=400, detail=f"Menu item {menu_item_id} not found")
        if not menu_item.is_available:
            raise HTTPException(status_code=400, detail=f"{menu_item.item_name} is currently unavailable")

        unit_price = to_decimal(menu_item.base_price)
        modifier_total = Decimal(0)

        modifier_ids = li.modifier_ids or []
        if modifier_ids:
            mod_r = await db.execute(
                select(MenuModifierOption).where(MenuModifierOption.id.in_(modifier_ids))
            )
            for mod in mod_r.scalars().all():
                modifier_total += to_decimal(mod.price_adjustment)
            unit_price += modifier_total

        total_price = money_round(unit_price * qty, precision, rounding_mode)
        subtotal += total_price

        line_items.append(OrderLineItem(
            menu_item_id=menu_item_id,
            item_snapshot={"item_name": menu_item.item_name, "image_url": menu_item.image_url},
            quantity=qty,
            unit_price=unit_price,
            line_total=total_price,
            modifier_total=modifier_total,
            selected_modifiers={"modifier_ids": modifier_ids},
            special_instructions=special,
            bundle_product_id=li.bundle_product_id,
            bundle_component_id=li.bundle_component_id,
            class_session_id=li.class_session_id,
        ))

    # Consume workshop session seats (locked; whole order fails when full)
    if has_workshop:
        from app.services.class_sessions import ClassSessionError, consume_session_seats
        for li in line_items_data:
            if li.menu_item_id in workshop_item_ids and li.class_session_id:
                try:
                    await consume_session_seats(
                        db,
                        menu_item_id=li.menu_item_id,
                        class_session_id=li.class_session_id,
                        quantity=max(1, li.quantity),
                    )
                except ClassSessionError as e:
                    raise HTTPException(status_code=e.status_code, detail=e.detail)

    # Compute fees from store config
    config_r = await db.execute(
        select(StoreConfiguration).where(
            StoreConfiguration.store_id == store_id,
            StoreConfiguration.config_key.in_(["order.service_charge", "order.tax_rate"]),
        )
    )
    config_map = {c.config_key: c.config_value for c in config_r.scalars().all()}
    service_charge = to_decimal(config_map.get("order.service_charge", 0))
    tax_rate = to_decimal(config_map.get("order.tax_rate", 0))
    tax_amount = money_round(subtotal * tax_rate, precision, rounding_mode)
    total = money_round(subtotal + service_charge + tax_amount, precision, rounding_mode)

    # ── Bundle discount (reuse customer order engine for consistency) ──
    calc_items = [
        SimpleNamespace(
            bundle_product_id=li.bundle_product_id,
            bundle_component_id=li.bundle_component_id,
            menu_item_id=li.menu_item_id,
            quantity=li.quantity,
            unit_price=li.unit_price - li.modifier_total,
            modifier_total=li.modifier_total,
        )
        for li in line_items
    ]
    bundle_discount, active_bundle_ids = await _compute_bundle_discount(db, calc_items)
    total = money_round(total - bundle_discount, precision, rounding_mode)

    # ── Add-on Deal discount ──
    addon_discount = Decimal(0)
    if active_bundle_ids and line_items:
        mi_ids = set(l.menu_item_id for l in line_items)
        mi_result = await db.execute(select(MenuItem).where(MenuItem.id.in_(mi_ids)))
        mis = {mi.id: mi for mi in mi_result.scalars().all()}
        for l in line_items:
            if l.bundle_product_id is not None:
                continue
            mi = mis.get(l.menu_item_id)
            if not mi or not mi.is_addon_deal_eligible:
                continue
            if not mi.eligible_bundle_ids:
                continue
            if not active_bundle_ids.intersection(set(mi.eligible_bundle_ids)):
                continue
            line_unit = to_decimal(l.unit_price)
            if mi.addon_discount_type == "percentage":
                pct = to_decimal(mi.addon_discount_value) / Decimal(100)
                disc = money_round(line_unit * pct * l.quantity, precision, rounding_mode)
            else:
                disc = to_decimal(mi.addon_discount_value) * l.quantity
            disc = min(disc, line_unit * l.quantity)
            addon_discount += disc
        total = money_round(total - addon_discount, precision, rounding_mode)

    # Idempotent replay: return existing order for the same client key
    if data.idempotency_key:
        existing_order_r = await db.execute(
            select(Order).where(Order.idempotency_key == data.idempotency_key)
        )
        existing_order = existing_order_r.scalar_one_or_none()
        if existing_order:
            replay_change = Decimal(0)
            if payment_data and existing_order.total_amount > 0 and payment_data.method == "cash":
                tendered = to_decimal(payment_data.amount_tendered)
                replay_change = money_round(max(Decimal(0), tendered - to_decimal(existing_order.total_amount)), precision, rounding_mode)
            return APIResponse(data={
                "order_id": existing_order.id,
                "order_number": existing_order.order_number,
                "status": existing_order.status,
                "total": existing_order.total_amount,
                "change": replay_change,
                "created_at": existing_order.created_at.isoformat(),
            })

    # POS offline-mode replay: the staff portal queues orders with a
    # client-generated client_ref while offline and retries them on sync.
    # A replay must return the existing order (HTTP 200) rather than
    # duplicate the sale.
    if data.client_ref:
        client_ref_r = await db.execute(
            select(Order).where(
                Order.store_id == store_id,
                Order.client_ref == data.client_ref,
                Order.deleted_at.is_(None),
            )
        )
        client_ref_order = client_ref_r.scalar_one_or_none()
        if client_ref_order:
            logger.info(
                "POS client_ref replay: store_id=%s client_ref=%s -> existing order %s",
                store_id, data.client_ref, client_ref_order.id,
            )
            response.status_code = status.HTTP_200_OK
            replay_change = Decimal(0)
            if payment_data and client_ref_order.total_amount > 0 and payment_data.method == "cash":
                tendered = to_decimal(payment_data.amount_tendered or 0)
                replay_change = money_round(max(Decimal(0), tendered - to_decimal(client_ref_order.total_amount)), precision, rounding_mode)
            return APIResponse(data={
                "order_id": client_ref_order.id,
                "order_number": client_ref_order.order_number,
                "status": client_ref_order.status,
                "total": client_ref_order.total_amount,
                "change": replay_change,
                "created_at": client_ref_order.created_at.isoformat(),
            })

    # Generate order number
    from uuid import uuid4
    order_number = f"POS-{datetime.now(timezone.utc).strftime('%m%d')}-{uuid4().hex[:4].upper()}"

    order = Order(
        customer_id=customer_id,
        store_id=store_id,
        dining_table_id=dining_table_id,
        order_number=order_number,
        idempotency_key=data.idempotency_key,
        client_ref=data.client_ref,
        order_type=order_type,
        order_channel="pos",
        fulfillment_type={"dine_in":"dine_in_service","takeaway":"counter_pickup","delivery":"standard_delivery","drive_thru":"counter_pickup"}.get(order_type,"dine_in_service"),
        status="confirmed",
        payment_status="captured" if payment_data else "initiated",
        item_count=sum(li.quantity for li in line_items),
        items_subtotal=money_round(subtotal, precision, rounding_mode),
        service_charge=service_charge,
        tax_amount=tax_amount,
        discount_amount=money_round(bundle_discount + addon_discount, precision, rounding_mode),
        addon_discount=money_round(addon_discount, precision, rounding_mode),
        total_amount=total,
        total_amount_currency=store.currency_code,
        is_byot=bool(getattr(data, "is_byot", False)),
    )

    change = 0.0
    try:
        db.add(order)
        await db.flush()

        for li in line_items:
            li.order_id = order.id
            db.add(li)

        # Deduct recipe-based stock
        await _deduct_stock_for_order(db, order, line_items)

        # Award loyalty points (skip walk-in customer)
        if customer_id and not _is_walkin_customer(customer_id):
            loyalty_pts = await _award_pos_loyalty_points(db, customer_id, subtotal, order, order_number)
        else:
            loyalty_pts = 0

        # Create payment (skip if total is zero — e.g. complimentary orders)
        payment_url: str | None = None
        if payment_data and total > 0:
            amount_tendered = to_decimal(payment_data.amount_tendered or 0)

            # Map POS method to valid DB values
            method_type_map = {
                "cash": "cash",
                "card": "credit_card",
                "qr": "e_wallet",
                "stripe_qr": "qr_pay",
                "credit_card": "credit_card",
                "debit_card": "debit_card",
                "e_wallet": "e_wallet",
            }
            payment_method_type = method_type_map.get(payment_data.method, "cash")
            provider_map = {
                "cash": "cash",
                "card": "stripe",
                "qr": "grabpay",
                "stripe_qr": "stripe",
                "credit_card": "stripe",
                "debit_card": "stripe",
                "e_wallet": "grabpay",
            }
            provider = provider_map.get(payment_data.method, "cash")
            is_stripe_qr = payment_data.method == "stripe_qr"

            # Cash tender validation
            if payment_data.method == "cash" and amount_tendered < total:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient cash tendered. Required: RM {total:.2f}, Tendered: RM {amount_tendered:.2f}",
                )
            change = money_round(max(Decimal(0), amount_tendered - total), precision, rounding_mode) if payment_data.method == "cash" else Decimal(0)

            idempotency_key = f"pos-order-{order.id}-{payment_method_type}-{total:.2f}"
            dup = await db.execute(
                select(Payment)
                .where(Payment.idempotency_key == idempotency_key, Payment.status == "captured")
                .with_for_update()
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Duplicate payment request")

            payment_status = "pending_authorization" if is_stripe_qr else "captured"
            payment = Payment(
                order_id=order.id,
                provider=provider,
                payment_method_type=payment_method_type,
                idempotency_key=idempotency_key,
                amount=total,
                currency_code=store.currency_code,
                status=payment_status,
                # captured_amount must mirror the captured total for cash/manual
                # payments — refunds compute the refundable balance from it
                # (stripe_qr is set at real capture time instead).
                captured_amount=Decimal(0) if is_stripe_qr else total,
                net_amount=total if not is_stripe_qr else Decimal(0),
            )
            db.add(payment)
            await db.flush()
            await db.refresh(payment)

            if is_stripe_qr:
                order.payment_status = "pending_authorization"
                try:
                    checkout = await create_stripe_checkout_session(db, payment, order)
                except PaymentError as exc:
                    await db.rollback()
                    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
                payment.provider_transaction_id = checkout["id"]
                payment_url = checkout["url"]
            else:
                # Record a lifecycle event for captured POS payments (cash / manual card).
                await _add_payment_event(
                    db,
                    payment,
                    to_status="captured",
                    from_status="initiated",
                    amount=total,
                    provider_response={"method": payment_data.method, "tendered": float(amount_tendered) if payment_data.method == "cash" else None},
                )
                # Accrue annual spend + tier review/upgrade (loyalty program)
                from app.services.payment import _accrue_loyalty_annual_spend
                await _accrue_loyalty_annual_spend(db, payment)
                # Spend-based lucky draw: grant tickets on capture (idempotent)
                from app.services.lucky_draw import grant_tickets_for_order
                await grant_tickets_for_order(db, order)

        # Update table status if dine-in
        if dining_table_id and order_type == "dine_in":
            existing = await db.execute(
                select(TableStatusSnapshot).where(TableStatusSnapshot.table_id == dining_table_id).with_for_update()
            )
            snap = existing.scalar_one_or_none()
            if snap:
                snap.status = "occupied"
                snap.current_order_id = order.id
                snap.updated_at = datetime.now(timezone.utc)

        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if data.idempotency_key:
            existing_order_r = await db.execute(
                select(Order).where(Order.idempotency_key == data.idempotency_key)
            )
            existing_order = existing_order_r.scalar_one_or_none()
            if existing_order:
                replay_change = Decimal(0)
                if payment_data and existing_order.total_amount > 0 and payment_data.method == "cash":
                    tendered = to_decimal(payment_data.amount_tendered or 0)
                    replay_change = money_round(max(Decimal(0), tendered - to_decimal(existing_order.total_amount)), precision, rounding_mode)
                return APIResponse(data={
                    "order_id": existing_order.id,
                    "order_number": existing_order.order_number,
                    "status": existing_order.status,
                    "total": existing_order.total_amount,
                    "change": replay_change,
                    "created_at": existing_order.created_at.isoformat(),
                })
        # Concurrent offline-sync race on (store_id, client_ref): another
        # request won the unique index — return the winner (HTTP 200).
        if data.client_ref:
            client_ref_r = await db.execute(
                select(Order).where(
                    Order.store_id == store_id,
                    Order.client_ref == data.client_ref,
                    Order.deleted_at.is_(None),
                )
            )
            client_ref_order = client_ref_r.scalar_one_or_none()
            if client_ref_order:
                logger.info(
                    "POS client_ref replay after integrity race: store_id=%s client_ref=%s -> existing order %s",
                    store_id, data.client_ref, client_ref_order.id,
                )
                response.status_code = status.HTTP_200_OK
                replay_change = Decimal(0)
                if payment_data and client_ref_order.total_amount > 0 and payment_data.method == "cash":
                    tendered = to_decimal(payment_data.amount_tendered or 0)
                    replay_change = money_round(max(Decimal(0), tendered - to_decimal(client_ref_order.total_amount)), precision, rounding_mode)
                return APIResponse(data={
                    "order_id": client_ref_order.id,
                    "order_number": client_ref_order.order_number,
                    "status": client_ref_order.status,
                    "total": client_ref_order.total_amount,
                    "change": replay_change,
                    "created_at": client_ref_order.created_at.isoformat(),
                })
        raise
    except HTTPException:
        await db.rollback()
        raise
    except OrderError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.refresh(order)

    response_data = {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "total": total,
        "change": change,
        "created_at": order.created_at.isoformat(),
    }
    if payment_url:
        response_data["payment_url"] = payment_url
        # Generate a signed guest-pay token so a walk-in customer can scan the
        # QR and pay from their phone via the PWA without logging in.
        from app.core.security import create_guest_pay_token
        response_data["pay_token"] = create_guest_pay_token(order.id, order.store_id)

    return APIResponse(data=response_data)


# ── POS Display State (Redis-backed for cross-device support) ──


# Fields that must never be served through the unauthenticated display-state
# poll — they carry signed payment URLs / pay_tokens.
_DISPLAY_STATE_SENSITIVE_KEYS = {"paymentUrl", "pwaPayUrl", "payment_url", "pay_token", "payToken"}

@router.post("/staff/pos/display-state")
async def set_pos_display_state(
    staff: CurrentStaff,
    state: dict,
):
    """POS broadcasts display state to Redis so any device running /pos/display can poll it."""
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        raise HTTPException(status_code=503, detail="Display sync unavailable (no Redis)")
    state["store_id"] = staff.store_id
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    key = f"pos:display:{staff.store_id}"
    await redis.set(key, _json.dumps(state), ex=3600)  # 1-hour TTL
    return APIResponse(data={"ok": True})


@router.delete("/staff/pos/display-state")
async def clear_pos_display_state(staff: CurrentStaff):
    """Clear the POS display state (reset to idle)."""
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        raise HTTPException(status_code=503, detail="Display sync unavailable (no Redis)")
    key = f"pos:display:{staff.store_id}"
    await redis.delete(key)
    return APIResponse(data={"ok": True})


@router.get("/staff/pos/display-state")
async def get_pos_display_state(
    db: DBDependency,
    store_id: int = Query(...),
    key: str = Query(...),
):
    """Customer display polls this to get the current POS state.

    Unauthenticated except for the per-store display key (?key=) so a counter
    tablet can poll without a staff login. Signed payment URLs / pay_tokens
    are stripped from the served state; the display can still show a pay
    prompt via phase / payment_pending.
    """
    store = await db.get(Store, store_id)
    if not store or store.deleted_at is not None or not store.display_key or store.display_key != key:
        raise HTTPException(status_code=403, detail="Invalid display key")
    from app.core.cache import get_redis_client
    redis = get_redis_client()
    if not redis:
        return APIResponse(data=None)
    redis_key = f"pos:display:{store_id}"
    raw = await redis.get(redis_key)
    if not raw:
        return APIResponse(data=None)
    try:
        state = _json.loads(raw)
    except Exception:
        return APIResponse(data=None)
    for sensitive in _DISPLAY_STATE_SENSITIVE_KEYS:
        state.pop(sensitive, None)
    if state.get("phase") in ("payment", "qr_payment"):
        state["payment_pending"] = True
    return APIResponse(data=state)
