"""Public self-ordering kiosk endpoints (guest orders)."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.routes.deps import DBDependency
from app.core.money import money_round, to_decimal
from app.core.security import create_guest_pay_token
from app.models.cart import CartLineItem, CustomerCart
from app.models.customer import Customer
from app.models.menu import MenuItem
from app.models.store import DiningTable, Store
from app.schemas.base import APIResponse, Money
from app.schemas.order import OrderCreate
from app.services.order import OrderError, create_order_from_cart
from app.services.platform_config import PlatformConfigService

public_router = APIRouter(prefix="/kiosk", tags=["kiosk"])


class KioskOrderItem(BaseModel):
    menu_item_id: int = Field(..., gt=0)
    quantity: int = Field(..., ge=1)
    modifier_option_ids: list[int] | None = None
    variant_id: int | None = None


class KioskOrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    store_id: int = Field(..., gt=0)
    order_type: str = Field(..., pattern="^(dine_in|takeaway)$")
    items: list[KioskOrderItem] = Field(..., min_length=1)
    dining_table_number: str | None = Field(None, max_length=20)


class KioskOrderOut(BaseModel):
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


@public_router.post("/orders", response_model=APIResponse[KioskOrderOut], status_code=status.HTTP_201_CREATED)
async def create_kiosk_order(
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

    # Batch-load modifier options and variants for price calculation
    from app.models.menu import MenuModifierOption, MenuVariant
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

    variants_map: dict[int, MenuVariant] = {}
    if all_variant_ids:
        v_result = await db.execute(
            select(MenuVariant).where(MenuVariant.id.in_(all_variant_ids))
        )
        for v in v_result.scalars().all():
            variants_map[v.id] = v

    # Get or create walk-in customer
    walkin = await _get_or_create_walkin_customer(db)

    # Get or create cart for walk-in customer at this store
    cart_result = await db.execute(
        select(CustomerCart).where(
            CustomerCart.customer_id == walkin.id,
            CustomerCart.store_id == data.store_id,
        )
    )
    cart = cart_result.scalar_one_or_none()
    if cart is None:
        cart = CustomerCart(
            customer_id=walkin.id,
            store_id=data.store_id,
            item_count=0,
            subtotal=Decimal("0"),
        )
        db.add(cart)
        await db.flush()
        await db.refresh(cart)

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

        # Apply variant price adjustment
        if line.variant_id and line.variant_id in variants_map:
            variant = variants_map[line.variant_id]
            unit_price += to_decimal(variant.price_adjustment or 0)

        # Apply modifier option price adjustments
        selected_modifiers: dict = {}
        if line.modifier_option_ids:
            for opt_id in line.modifier_option_ids:
                opt = modifier_options_map.get(opt_id)
                if opt:
                    adj = to_decimal(opt.price_adjustment or 0)
                    modifier_total += adj
                    # Group by modifier group
                    gid = opt.modifier_group_id
                    if gid not in selected_modifiers:
                        selected_modifiers[str(gid)] = []
                    selected_modifiers[str(gid)].append({
                        "option_id": opt.id,
                        "option_name": opt.option_name,
                        "price_adjustment": float(adj),
                    })

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
        dining_table_id=dining_table_id,
    )

    try:
        order = await create_order_from_cart(db, walkin.id, order_data)
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
