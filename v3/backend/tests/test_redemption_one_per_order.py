"""Unit tests for the one-voucher-OR-one-reward golden rule.

Flow doc §2A: a customer picks ONE voucher OR ONE reward per order. These
tests pin the three hard guards:

- customer order-create rejects an order carrying BOTH a voucher_code and a
  reward_id BEFORE either is consumed (statuses stay untouched);
- staff apply-voucher rejects an order that already has a reward discount;
- staff apply-reward rejects an order that already has a voucher discount.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.order import Order
from app.schemas.order import ApplyOrderRewardRequest, ApplyOrderVoucherRequest, OrderCreate
from app.services.order import OrderError, create_order_from_cart


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, one=None, rows=None, all_rows=None, row=None, scalar=None):
        self._one = one
        self._rows = rows or []
        self._all = all_rows if all_rows is not None else []
        self._row = row if row is not None else one
        self._scalar = scalar if scalar is not None else one

    def scalar_one_or_none(self):
        return self._one

    def scalar_one(self):
        return self._scalar

    def scalar(self):
        return self._scalar

    def first(self):
        return self._row

    def scalars(self):
        return _FakeScalars(self._rows)

    def all(self):
        return self._all


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _added(db, model):
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], model)]


@pytest.fixture
def fake_config(monkeypatch):
    config = MagicMock()
    config.get_accounting_precision = AsyncMock(return_value=2)
    config.get_accounting_rounding = AsyncMock(return_value="ROUND_HALF_UP")
    monkeypatch.setattr("app.services.order.PlatformConfigService", lambda db: config)
    return config


# ---------------------------------------------------------------------------
# Customer order-create: both voucher_code + reward_id → 400, nothing consumed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_order_create_with_both_voucher_and_reward_rejects_before_consumption(fake_config):
    """A cart order carrying BOTH a voucher_code and a reward_id is a 400, and
    no voucher/reward lookup (consumption) query is ever issued."""
    cart = SimpleNamespace(
        id=1, customer_id=7, store_id=3, item_count=1, subtotal=Decimal("10.00")
    )
    store = SimpleNamespace(id=3, currency_code="MYR")
    cart_item = SimpleNamespace(
        menu_item_id=11, menu_variant_id=None, quantity=1,
        unit_price=Decimal("10.00"), modifier_total=Decimal("0"),
        line_total=Decimal("10.00"), selected_modifiers={},
        special_instructions=None, bundle_product_id=None,
        bundle_component_id=None, class_session_id=None,
    )

    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=cart),          # cart fetch
        _FakeResult(one=store),         # store fetch
        _FakeResult(rows=[cart_item]),  # cart line items
        _FakeResult(all_rows=[]),       # members-only locked items
        _FakeResult(rows=[]),           # store configuration
    ])

    data = OrderCreate(
        store_id=3, cart_id=1, order_type="takeaway",
        voucher_code="WELCOME-RM5", reward_id=99,
    )

    with pytest.raises(OrderError) as exc_info:
        await create_order_from_cart(db, 7, data)

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.message
    # The guard fires before any voucher/reward lookup — only the 5 pre-
    # redemption queries ran, so neither a voucher nor a reward was consumed.
    assert db.execute.await_count == 5
    assert _added(db, Order) == []


# ---------------------------------------------------------------------------
# Staff apply-voucher / apply-reward hard either-or guards
# ---------------------------------------------------------------------------


def _staff_order(*, reward_discount=Decimal("0"), voucher_discount=Decimal("0"), items_subtotal=Decimal("10.00")):
    return SimpleNamespace(
        id=1,
        customer_id=7,
        store_id=3,
        status="pending",
        payment_status="initiated",
        reward_discount=reward_discount,
        voucher_discount=voucher_discount,
        items_subtotal=items_subtotal,
    )


@pytest.mark.asyncio
async def test_staff_apply_voucher_rejected_when_reward_already_applied():
    from app.api.routes.endpoints.staff.orders import apply_staff_order_voucher

    order = _staff_order(reward_discount=Decimal("5.00"))
    db = _async_db()
    db.execute = AsyncMock(return_value=_FakeResult(one=order))
    staff = SimpleNamespace(store_id=3)

    with pytest.raises(HTTPException) as exc_info:
        await apply_staff_order_voucher(
            staff, db, 1, ApplyOrderVoucherRequest(voucher_code="WELCOME-RM5")
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_staff_apply_reward_rejected_when_voucher_already_applied():
    from app.api.routes.endpoints.staff.orders import apply_staff_order_reward

    order = _staff_order(voucher_discount=Decimal("5.00"))
    db = _async_db()
    db.execute = AsyncMock(return_value=_FakeResult(one=order))
    staff = SimpleNamespace(store_id=3)

    with pytest.raises(HTTPException) as exc_info:
        await apply_staff_order_reward(
            staff, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_staff_apply_voucher_rejected_when_reward_bound_zero_discount():
    """A reward bound to the order with zero discount (e.g. free_delivery on a
    takeaway order) still blocks a voucher — bound-row check, not just the
    reward_discount amount."""
    from app.api.routes.endpoints.staff.orders import apply_staff_order_voucher

    order = _staff_order(reward_discount=Decimal("0"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),          # order fetch
        _FakeResult(one=123),            # bound CustomerReward.id
    ])
    staff = SimpleNamespace(store_id=3)

    with pytest.raises(HTTPException) as exc_info:
        await apply_staff_order_voucher(
            staff, db, 1, ApplyOrderVoucherRequest(voucher_code="WELCOME-RM5")
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_staff_apply_reward_rejected_when_voucher_bound_zero_discount():
    from app.api.routes.endpoints.staff.orders import apply_staff_order_reward

    order = _staff_order(voucher_discount=Decimal("0"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),          # order fetch
        _FakeResult(one=123),            # bound CustomerVoucher.id
    ])
    staff = SimpleNamespace(store_id=3)

    with pytest.raises(HTTPException) as exc_info:
        await apply_staff_order_reward(
            staff, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_staff_apply_reward_rejects_below_minimum_order():
    """Reward minimum_order_value is enforced pre-consumption on the staff path."""
    from app.api.routes.endpoints.staff.orders import apply_staff_order_reward

    order = _staff_order(items_subtotal=Decimal("5.00"))
    customer_reward = SimpleNamespace(expires_at=None)
    reward_cat = SimpleNamespace(id=5, minimum_order_value=Decimal("10.00"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),                        # order fetch
        _FakeResult(one=None),                         # bound voucher check
        _FakeResult(row=(customer_reward, reward_cat)),  # reward + catalog fetch
        _FakeResult(scalar=reward_cat),                # catalog re-lock
    ])
    staff = SimpleNamespace(store_id=3)

    with pytest.raises(HTTPException) as exc_info:
        await apply_staff_order_reward(
            staff, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "minimum order" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Admin apply-voucher / apply-reward: same golden rule
# ---------------------------------------------------------------------------


@pytest.fixture
def _mock_require_store_admin(monkeypatch):
    from app.api.routes.endpoints.admin import orders as admin_orders
    monkeypatch.setattr(admin_orders, "require_store_admin", AsyncMock())


@pytest.mark.asyncio
async def test_admin_apply_voucher_rejected_when_reward_already_applied(_mock_require_store_admin):
    from app.api.routes.endpoints.admin.orders import apply_order_voucher

    order = _staff_order(reward_discount=Decimal("5.00"))
    db = _async_db()
    db.execute = AsyncMock(return_value=_FakeResult(one=order))
    admin = SimpleNamespace()

    with pytest.raises(HTTPException) as exc_info:
        await apply_order_voucher(
            admin, db, 1, ApplyOrderVoucherRequest(voucher_code="WELCOME-RM5")
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_admin_apply_voucher_rejected_when_reward_bound_zero_discount(_mock_require_store_admin):
    from app.api.routes.endpoints.admin.orders import apply_order_voucher

    order = _staff_order(reward_discount=Decimal("0"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),          # order fetch
        _FakeResult(one=123),            # bound CustomerReward.id
    ])
    admin = SimpleNamespace()

    with pytest.raises(HTTPException) as exc_info:
        await apply_order_voucher(
            admin, db, 1, ApplyOrderVoucherRequest(voucher_code="WELCOME-RM5")
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_admin_apply_reward_rejected_when_voucher_already_applied(_mock_require_store_admin):
    from app.api.routes.endpoints.admin.orders import apply_order_reward

    order = _staff_order(voucher_discount=Decimal("5.00"))
    db = _async_db()
    db.execute = AsyncMock(return_value=_FakeResult(one=order))
    admin = SimpleNamespace()

    with pytest.raises(HTTPException) as exc_info:
        await apply_order_reward(
            admin, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_admin_apply_reward_rejected_when_voucher_bound_zero_discount(_mock_require_store_admin):
    from app.api.routes.endpoints.admin.orders import apply_order_reward

    order = _staff_order(voucher_discount=Decimal("0"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),          # order fetch
        _FakeResult(one=123),            # bound CustomerVoucher.id
    ])
    admin = SimpleNamespace()

    with pytest.raises(HTTPException) as exc_info:
        await apply_order_reward(
            admin, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "one voucher OR one reward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_admin_apply_reward_rejects_below_minimum_order(_mock_require_store_admin):
    from app.api.routes.endpoints.admin.orders import apply_order_reward

    order = _staff_order(items_subtotal=Decimal("5.00"))
    customer_reward = SimpleNamespace(expires_at=None)
    reward_cat = SimpleNamespace(minimum_order_value=Decimal("10.00"))
    db = _async_db()
    db.execute = AsyncMock(side_effect=[
        _FakeResult(one=order),                          # order fetch
        _FakeResult(one=None),                           # bound voucher check
        _FakeResult(row=(customer_reward, reward_cat)),  # reward + catalog fetch
    ])
    admin = SimpleNamespace()

    with pytest.raises(HTTPException) as exc_info:
        await apply_order_reward(
            admin, db, 1, ApplyOrderRewardRequest(reward_id=9)
        )

    assert exc_info.value.status_code == 400
    assert "minimum order" in exc_info.value.detail
