"""Public self-ordering kiosk endpoints (guest orders)."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.deps import DBDependency
from app.core.money import money_round, to_decimal
from app.core.rate_limiter import limiter
from app.core.security import create_guest_pay_token
from app.models.cart import CartLineItem, CustomerCart
from app.models.customer import Customer
from app.models.menu import MenuItem
from app.models.store import DiningTable, Store
from app.schemas.base import APIResponse, Money, BaseSchema
from app.schemas.order import OrderCreate
from app.services.order import OrderError, create_order_from_cart
from app.services.platform_config import PlatformConfigService

public_router = APIRouter(prefix="/kiosk", tags=["kiosk"])


class KioskOrderItem(BaseSchema):
    menu_item_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=1, le=99)
    modifier_option_ids: list[int] | None = Field(None, max_length=50)
    variant_id: int | None = None


class KioskOrderCreateRequest(BaseSchema):
    model_config = ConfigDict(extra="ignore")
    store_id: int = Field(..., gt=0)
    order_type: str = Field(..., pattern="^(dine_in|takeaway)$")
    items: list[KioskOrderItem] = Field(..., min_length=1, max_length=100)
    dining_table_number: str | None = Field(None, max_length=20)
    customer_phone: str | None = Field(None, max_length=20, description="Optional phone to link order to an existing or new customer profile")


class KioskOrderOut(BaseSchema):
    order_id: int
    order_number: str
    status: str
    payment_status: str
    total_amount: Money
    currency_code: str
    pay_token: str


async def _get_or_create_walkin_customer(db) -> Customer:
    result = await db.execute(
        select(Customer).where(
            Customer.phone_number == "+0000000000",
            Customer.deleted_at.is_(None),
        )
    )
    walkin = result.scalar_one_or_none()
    if walkin:
        return walkin
    walkin = Customer(
        phone_number="+0000000000",
        display_name="Walk-in",
        is_active=True,
        preferred_language="en",
    )
    db.add(walkin)
    await db.flush()
    await db.refresh(walkin)
    return walkin


async def _find_or_create_kiosk_customer(db, raw_phone: str) -> Customer | None:
    """Find customer by phone or create a minimal profile. Normalises Malaysian formats.

    Unlike the staff find-or-create, this skips OTP — the customer is at the kiosk
    in person and verified by staff at the counter. When the customer later registers
    with the same phone via OTP they take over the same profile.

    Returns None when the phone matches a deactivated (banned) account: the
    unauthenticated kiosk endpoint must never reactivate it, and the phone's
    uniqueness constraint forbids creating a duplicate — the caller falls
    back to the walk-in guest profile instead.
    """
    import re
    phone = re.sub(r"[^\d+]", "", raw_phone.strip())
    if phone.startswith("60") and len(phone) >= 10:
        phone = "+" + phone
    elif phone.startswith("01") and 9 <= len(phone) <= 11:
        phone = "+6" + phone
    elif phone.startswith("+60") and len(phone) >= 11:
        pass
    elif phone.startswith("1") and len(phone) == 10 and not phone.startswith("10"):
        phone = "+6" + phone
    else:
        phone = "+6" + phone if not phone.startswith("+") else phone

    result = await db.execute(
        select(Customer).where(
            Customer.phone_number == phone,
            Customer.deleted_at.is_(None),
        )
    )
    customer = result.scalar_one_or_none()
    if customer:
        if not customer.is_active:
            return None
        return customer

    customer = Customer(
        phone_number=phone,
        display_name="Kiosk Customer",
        is_active=True,
        preferred_language="en",
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return customer


@public_router.post("/orders", response_model=APIResponse[KioskOrderOut], status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_kiosk_order(
    request: Request,
    db: DBDependency,
    data: KioskOrderCreateRequest,
):
    """Create a guest kiosk order and return a guest-pay token for payment."""
    # Validate store
    store_result = await db.execute(
        select(Store).where(
            Store.id == data.store_id,
            Store.is_active.is_(True),
            Store.deleted_at.is_(None),
        )
    )
    store = store_result.scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found or inactive")

    # Resolve dining table number if provided
    dining_table_id: int | None = None
    if data.dining_table_number:
        table_result = await db.execute(
            select(DiningTable).where(
                DiningTable.store_id == data.store_id,
                DiningTable.table_number == data.dining_table_number.strip(),
                DiningTable.deleted_at.is_(None),
            )
        )
        table = table_result.scalar_one_or_none()
        if table is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Table {data.dining_table_number} not found",
            )
        dining_table_id = table.id

    # Resolve menu items and prices
    config_service = PlatformConfigService(db)
    precision = await config_service.get_accounting_precision()
    rounding_mode = await config_service.get_accounting_rounding()

    menu_item_ids = {i.menu_item_id for i in data.items}
    items_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(menu_item_ids),
            MenuItem.is_available.is_(True),
            MenuItem.deleted_at.is_(None),
        )
    )
    menu_items_map = {mi.id: mi for mi in items_result.scalars().all()}

    # Workshops/classes (experiences category) are session-booked on the PWA —
    # the kiosk checkout has no session concept, so reject them outright.
    if menu_items_map:
        from app.models.menu import MenuCategory
        exp_cat_result = await db.execute(
            select(MenuCategory.id).where(MenuCategory.slug == "experiences")
        )
        exp_cat_id = exp_cat_result.scalar_one_or_none()
        if exp_cat_id is not None:
            for line in data.items:
                mi = menu_items_map.get(line.menu_item_id)
                if mi is not None and mi.category_id == exp_cat_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"“{mi.item_name}” is a class — please book it on the mobile app",
                    )

    # Batch-load modifier options and variants for price calculation
    from app.models.menu import MenuModifierGroup, MenuModifierOption, MenuVariant
    all_modifier_option_ids = set()
    all_variant_ids = set()
    for line in data.items:
        if line.modifier_option_ids:
            all_modifier_option_ids.update(line.modifier_option_ids)
        if line.variant_id:
            all_variant_ids.add(line.variant_id)

    modifier_options_map: dict[int, MenuModifierOption] = {}
    if all_modifier_option_ids:
        mo_result = await db.execute(
            select(MenuModifierOption).where(MenuModifierOption.id.in_(all_modifier_option_ids))
        )
        for mo in mo_result.scalars().all():
            modifier_options_map[mo.id] = mo

    modifier_groups_map: dict[int, MenuModifierGroup] = {}
    mg_result = await db.execute(
        select(MenuModifierGroup).where(MenuModifierGroup.menu_item_id.in_(menu_item_ids))
    )
    for mg in mg_result.scalars().all():
        modifier_groups_map[mg.id] = mg

    variants_map: dict[int, MenuVariant] = {}
    if all_variant_ids:
        v_result = await db.execute(
            select(MenuVariant).where(MenuVariant.id.in_(all_variant_ids))
        )
        for v in v_result.scalars().all():
            variants_map[v.id] = v

    # Get or create customer — phone-based if provided, else walk-in.
    # A phone matching a deactivated account yields None (never reactivates
    # it, never duplicates the unique phone row) → order as walk-in guest.
    if data.customer_phone:
        kiosk_customer = await _find_or_create_kiosk_customer(db, data.customer_phone)
        if kiosk_customer is None:
            kiosk_customer = await _get_or_create_walkin_customer(db)
    else:
        kiosk_customer = await _get_or_create_walkin_customer(db)

    # Get or create cart for this customer at this store. The row lock
    # serialises concurrent kiosk orders sharing the same cart so two
    # kiosks cannot wipe/rebuild each other's lines mid-order.
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.customer_id == kiosk_customer.id,
            CustomerCart.store_id == data.store_id,
        ).with_for_update()
    )
    cart = cart_result.scalar_one_or_none()
    if cart is None:
        cart = CustomerCart(
            customer_id=kiosk_customer.id,
            store_id=data.store_id,
            item_count=0,
            subtotal=Decimal("0"),
        )
        db.add(cart)
        try:
            async with db.begin_nested():
                await db.flush()
        except IntegrityError:
            # A concurrent kiosk request created the shared cart first —
            # lock and reuse that row instead.
            cart_result = await db.execute(
                select(CustomerCart).where(
                    CustomerCart.customer_id == kiosk_customer.id,
                    CustomerCart.store_id == data.store_id,
                ).with_for_update()
            )
            cart = cart_result.scalar_one()

    # Clear any existing cart lines (defensive)
    existing_lines_result = await db.execute(
        select(CartLineItem).where(CartLineItem.cart_id == cart.id)
    )
    for line in existing_lines_result.scalars().all():
        await db.delete(line)

    subtotal = Decimal(0)
    item_count = 0
    for line in data.items:
        menu_item = menu_items_map.get(line.menu_item_id)
        if menu_item is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Menu item {line.menu_item_id} is unavailable or not found",
            )
        unit_price = to_decimal(menu_item.base_price)
        modifier_total = Decimal("0")

        # Apply variant price adjustment — variant must belong to this item
        if line.variant_id:
            variant = variants_map.get(line.variant_id)
            if variant is None or variant.parent_item_id != line.menu_item_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Variant {line.variant_id} is not valid for menu item {line.menu_item_id}",
                )
            unit_price += to_decimal(variant.price_adjustment or 0)

        # Apply modifier option price adjustments, enforcing group rules
        selected_modifiers: dict = {}
        group_counts: dict[int, int] = {}
        if line.modifier_option_ids:
            for opt_id in line.modifier_option_ids:
                opt = modifier_options_map.get(opt_id)
                if opt is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Unknown modifier option {opt_id}",
                    )
                if not opt.is_available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Modifier option {opt_id} is unavailable",
                    )
                group = modifier_groups_map.get(opt.modifier_group_id)
                if group is None or group.menu_item_id != line.menu_item_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Modifier option {opt_id} does not belong to menu item {line.menu_item_id}",
                    )
                group_counts[group.id] = group_counts.get(group.id, 0) + 1
                adj = to_decimal(opt.price_adjustment or 0)
                modifier_total += adj
                gid = opt.modifier_group_id
                if gid not in selected_modifiers:
                    selected_modifiers[str(gid)] = []
                selected_modifiers[str(gid)].append({
                    "option_id": opt.id,
                    "option_name": opt.option_name,
                    "price_adjustment": float(adj),
                })

        # Enforce min/max selections for every modifier group of this item
        for group in modifier_groups_map.values():
            if group.menu_item_id != line.menu_item_id:
                continue
            count = group_counts.get(group.id, 0)
            if count > group.max_selections:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Too many selections for modifier group '{group.group_name}' (max {group.max_selections})",
                )
            min_required = max(group.min_selections, 1) if group.is_required else group.min_selections
            if (group.is_required and count < min_required) or (count > 0 and count < group.min_selections):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Modifier group '{group.group_name}' requires at least {min_required} selection(s)",
                )

        line_unit = unit_price + modifier_total
        line_total = money_round(line_unit * line.quantity, precision, rounding_mode)
        subtotal += line_total
        item_count += line.quantity
        db.add(
            CartLineItem(
                cart_id=cart.id,
                menu_item_id=line.menu_item_id,
                quantity=line.quantity,
                unit_price=unit_price,
                line_total=line_total,
                modifier_total=modifier_total,
                selected_modifiers=selected_modifiers if selected_modifiers else {},
                menu_variant_id=line.variant_id,
            )
        )

    cart.item_count = item_count
    cart.subtotal = subtotal
    await db.flush()

    order_data = OrderCreate(
        store_id=data.store_id,
        cart_id=cart.id,
        order_type=data.order_type,  # type: ignore[arg-type]
        # ck_orders_type_fulfillment_alignment: dine_in orders must be
        # dine_in_service; the schema default (counter_pickup) violates it.
        fulfillment_type="dine_in_service" if data.order_type == "dine_in" else "counter_pickup",
        dining_table_id=dining_table_id,
    )

    try:
        order = await create_order_from_cart(db, kiosk_customer.id, order_data)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Override order channel to kiosk for reporting
    order.order_channel = "kiosk"
    order.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)

    pay_token = create_guest_pay_token(order.id, order.store_id)

    return APIResponse(
        data=KioskOrderOut(
            order_id=order.id,
            order_number=order.order_number,
            status=order.status,
            payment_status=order.payment_status,
            total_amount=order.total_amount,
            currency_code=store.currency_code,
            pay_token=pay_token,
        )
    )
