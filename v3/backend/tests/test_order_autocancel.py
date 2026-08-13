"""Unit tests for order auto-cancellation and kiosk channel/mode payment flow."""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.loyalty import LoyaltyPointsLedger
from app.models.order import Order
from app.schemas.order import OrderCreate
from app.services.order import (
    auto_cancel_order,
    create_order_from_cart,
    reverse_order_effects,
)


# ---------------------------------------------------------------------------
# Fake DB helpers (same style as test_payment_service.py)
# ---------------------------------------------------------------------------


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, one=None, rows=None, scalar=None, all_rows=None):
        self._one = one
        self._rows = rows or []
        self._scalar = scalar
        self._all = all_rows if all_rows is not None else []

    def scalar_one_or_none(self):
        return self._one

    def scalar(self):
        return self._scalar

    def scalars(self):
        return _FakeScalars(self._rows)

    def all(self):
        return self._all


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def fake_config(monkeypatch):
    """Patch PlatformConfigService so order service tests do not hit the DB."""
    config = MagicMock()
    config.get = AsyncMock(return_value=None)
    config.get_accounting_precision = AsyncMock(return_value=2)
    config.get_accounting_rounding = AsyncMock(return_value="ROUND_HALF_UP")
    monkeypatch.setattr("app.services.order.PlatformConfigService", lambda db: config)
    return config


# ---------------------------------------------------------------------------
# auto_cancel_order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_cancel_order_guards_non_pending():
    """Orders already past 'pending' are left untouched."""
    db = _async_db()
    order = SimpleNamespace(id=5, status="confirmed")
    db.execute.side_effect = [_FakeResult(one=order)]  # self-enforced lock re-fetch

    result = await auto_cancel_order(db, order, "Auto-cancelled — unpaid for >2 hours")

    assert result is False
    assert order.status == "confirmed"
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_auto_cancel_order_reverses_effects_and_voids_payments(monkeypatch):
    """Pending orders are cancelled with full reversal + payment voiding."""
    reverse = AsyncMock()
    cancel_payments = AsyncMock(return_value=[11])
    monkeypatch.setattr("app.services.order.reverse_order_effects", reverse)
    monkeypatch.setattr(
        "app.services.payment.cancel_pending_order_payments", cancel_payments
    )

    db = _async_db()
    order = SimpleNamespace(id=5, status="pending", dining_table_id=None)
    db.execute.side_effect = [_FakeResult(one=order)]  # self-enforced lock re-fetch

    result = await auto_cancel_order(db, order, "Auto-cancelled — unpaid after 15 minutes")

    assert result is True
    assert order.status == "cancelled_by_customer"
    assert order.cancellation_reason == "Auto-cancelled — unpaid after 15 minutes"
    assert order.cancelled_at is not None
    reverse.assert_awaited_once_with(db, order)
    cancel_payments.assert_awaited_once_with(db, 5)


# ---------------------------------------------------------------------------
# reverse_order_effects — loyalty clawback probe + table lock release
# ---------------------------------------------------------------------------


def _reversal_db(*, earned_count, la=None, snap=None):
    """Queue the db.execute results reverse_order_effects consumes."""
    db = _async_db()
    results = [
        _FakeResult(rows=[]),  # class session lines
    ]
    if earned_count is not None:
        results.append(_FakeResult(scalar=earned_count))  # order_earned probe
        if earned_count > 0:
            results.append(_FakeResult(one=la))  # loyalty account
    results += [
        _FakeResult(rows=[]),  # customer vouchers
        _FakeResult(rows=[]),  # customer rewards
        _FakeResult(rows=[]),  # order line items (no stock restore)
        _FakeResult(one=snap),  # table status snapshot
    ]
    db.execute.side_effect = results
    return db


@pytest.mark.asyncio
async def test_reverse_effects_skips_clawback_when_points_never_credited():
    """Without an 'order_earned' ledger row the balance must not be touched."""
    la = SimpleNamespace(points_balance=100, lifetime_points_earned=100)
    db = _reversal_db(earned_count=0, la=la)
    order = SimpleNamespace(
        id=5, order_number="ORD-5", customer_id=7, store_id=3,
        loyalty_points_earned=50, dining_table_id=None,
    )

    await reverse_order_effects(db, order)

    assert la.points_balance == 100
    assert order.loyalty_points_earned == 50  # estimate kept; nothing was credited
    ledgers = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], LoyaltyPointsLedger)]
    assert ledgers == []


@pytest.mark.asyncio
async def test_reverse_effects_claws_back_only_credited_points(monkeypatch):
    """With an 'order_earned' ledger row the credited points are reversed."""
    recalc = AsyncMock()
    monkeypatch.setattr("app.services.commerce._recalculate_tier", recalc)
    la = SimpleNamespace(
        id=1, points_balance=100, lifetime_points_earned=100, current_tier_id=None
    )
    db = _reversal_db(earned_count=1, la=la)
    order = SimpleNamespace(
        id=5, order_number="ORD-5", customer_id=7, store_id=3,
        loyalty_points_earned=50, dining_table_id=None,
    )

    await reverse_order_effects(db, order)

    assert la.points_balance == 50
    assert la.lifetime_points_earned == 50
    assert order.loyalty_points_earned == 0
    ledgers = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], LoyaltyPointsLedger)]
    assert len(ledgers) == 1
    assert ledgers[0].points_delta == -50
    assert ledgers[0].event_type == "return_deduction"
    recalc.assert_awaited_once()


@pytest.mark.asyncio
async def test_reverse_effects_releases_table_lock_for_order():
    """A snapshot pointing at the cancelled order goes back to 'available'."""
    snap = SimpleNamespace(status="occupied", current_order_id=5, updated_at=None)
    db = _reversal_db(earned_count=None, snap=snap)
    order = SimpleNamespace(
        id=5, order_number="ORD-5", customer_id=7, store_id=3,
        loyalty_points_earned=0, dining_table_id=9,
    )

    await reverse_order_effects(db, order)

    assert snap.status == "available"
    assert snap.current_order_id is None
    assert snap.updated_at is not None


@pytest.mark.asyncio
async def test_reverse_effects_keeps_table_lock_of_other_order():
    """A snapshot taken over by a newer order is left alone."""
    snap = SimpleNamespace(status="occupied", current_order_id=99, updated_at=None)
    db = _reversal_db(earned_count=None, snap=snap)
    order = SimpleNamespace(
        id=5, order_number="ORD-5", customer_id=7, store_id=3,
        loyalty_points_earned=0, dining_table_id=9,
    )

    await reverse_order_effects(db, order)

    assert snap.status == "occupied"
    assert snap.current_order_id == 99


# ---------------------------------------------------------------------------
# create_order_from_cart — kiosk channel/mode payment flow
# ---------------------------------------------------------------------------


def _cart_db():
    """Mock db whose execute queue matches a minimal 1-item dine-in checkout."""
    cart = SimpleNamespace(
        id=1, customer_id=7, store_id=3, item_count=1, subtotal=Decimal("10.00")
    )
    store = SimpleNamespace(id=3, currency_code="MYR")
    cart_item = SimpleNamespace(
        menu_item_id=11, menu_variant_id=None, quantity=2,
        unit_price=Decimal("5.00"), modifier_total=Decimal("0"),
        line_total=Decimal("10.00"), selected_modifiers={},
        special_instructions=None, bundle_product_id=None,
        bundle_component_id=None, class_session_id=None,
    )
    menu_item = SimpleNamespace(
        id=11, item_name="Burger", item_code="B1", image_url=None,
        base_price=Decimal("5.00"), category_id=1, minimum_tier_id=None,
    )
    customer = SimpleNamespace(order_count=5)

    db = _async_db()
    db.execute.side_effect = [
        _FakeResult(one=cart),            # cart fetch
        _FakeResult(one=store),           # store fetch
        _FakeResult(rows=[cart_item]),    # cart line items
        _FakeResult(all_rows=[]),         # members-only locked items
        _FakeResult(rows=[]),             # store configuration
        _FakeResult(rows=[menu_item]),    # menu items for snapshots
        _FakeResult(one=None),            # experiences category
        _FakeResult(rows=[]),             # menu item recipes (stock)
        _FakeResult(one=None),            # loyalty account (points display)
    ]
    db.get = AsyncMock(return_value=customer)
    return db


def _created_order(db) -> Order:
    for call in db.add.call_args_list:
        if isinstance(call.args[0], Order):
            return call.args[0]
    raise AssertionError("no Order was added")


@pytest.mark.asyncio
async def test_kiosk_dine_in_standing_kiosk_is_prepaid(fake_config):
    """Standing-kiosk dine-in: pending + prepaid (pay before food)."""
    db = _cart_db()
    data = OrderCreate(
        store_id=3, cart_id=1, order_type="dine_in", fulfillment_type="dine_in_service"
    )

    await create_order_from_cart(
        db, 7, data, order_channel="kiosk", kiosk_mode="kiosk"
    )

    order = _created_order(db)
    assert order.order_channel == "kiosk"
    assert order.status == "pending"
    assert order.payment_flow == "prepaid"


@pytest.mark.asyncio
async def test_kiosk_dine_in_tablet_is_open_tab(fake_config):
    """Tablet-on-table dine-in: confirmed + pay_after_meal open tab."""
    db = _cart_db()
    data = OrderCreate(
        store_id=3, cart_id=1, order_type="dine_in", fulfillment_type="dine_in_service"
    )

    await create_order_from_cart(
        db, 7, data, order_channel="kiosk", kiosk_mode="tablet"
    )

    order = _created_order(db)
    assert order.order_channel == "kiosk"
    assert order.status == "confirmed"
    assert order.payment_flow == "pay_after_meal"


@pytest.mark.asyncio
async def test_mobile_app_dine_in_stays_open_tab(fake_config):
    """Default channel (customer PWA) dine-in keeps the open tab."""
    db = _cart_db()
    data = OrderCreate(
        store_id=3, cart_id=1, order_type="dine_in", fulfillment_type="dine_in_service"
    )

    await create_order_from_cart(db, 7, data)

    order = _created_order(db)
    assert order.order_channel == "mobile_app"
    assert order.status == "confirmed"
    assert order.payment_flow == "pay_after_meal"
