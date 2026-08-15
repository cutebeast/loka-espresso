"""Unit tests for audit round-38 order-creation guards (C1-C5).

- C1: POS stripe_qr orders stay pending + initiated (out of the kitchen,
  covered by the 2h prepaid sweep) until capture advances them; cash orders
  are unchanged (confirmed + captured).
- C2: the kiosk order request carries an optional idempotency key through to
  the service-layer replay instead of dropping it (extra="ignore").
- C3: create_order_from_cart validates the dine-in table (exists, active,
  not deleted, same store) before accepting the order.
- C4: the dine-in table lock is taken inside the order-creation transaction
  (single commit).
- C5: the initial status log records the real initial status.
"""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Response

from app.models.order import Order, OrderStatusLog
from app.models.payment import Payment
from app.models.store import TableStatusSnapshot
from app.schemas.order import OrderCreate
from app.schemas.staff import POSLineItem, POSOrderCreateRequest, POSPayment
from app.services.order import OrderError, create_order_from_cart


# ---------------------------------------------------------------------------
# Fake DB helpers (same style as test_order_autocancel.py)
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
# C1 — POS stripe_qr orders stay pending until capture
# ---------------------------------------------------------------------------


def _pos_db():
    """Mock db for a 1-item POS checkout (walk-in).

    Answers by FROM-table rather than a fixed queue — the endpoint's query
    order shifts as the code evolves, and a positional queue silently
    misaligns (a config fetch consumed a menu-item row and 500'd the mock).
    """
    store = SimpleNamespace(id=3, currency_code="MYR")
    walkin = SimpleNamespace(id=7)
    menu_item = SimpleNamespace(
        id=11, item_name="Burger", image_url=None,
        base_price=Decimal("10.00"), is_available=True,
    )

    def _answer(stmt):
        s = str(stmt)
        table = s.split("FROM")[1].split("WHERE")[0].strip().split()[0] if "FROM" in s else ""
        if table == "stores":
            return _FakeResult(one=store)
        if table == "customers":
            return _FakeResult(one=walkin)
        if table == "menu_items":
            return _FakeResult(one=menu_item)
        return _FakeResult(one=None, rows=[])

    db = _async_db()
    db.execute = AsyncMock(side_effect=_answer)

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1001
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


def _pos_request(method: str) -> POSOrderCreateRequest:
    payment = POSPayment(method=method)
    if method == "cash":
        payment.amount_tendered = Decimal("10.00")
    return POSOrderCreateRequest(
        order_type="takeaway",
        line_items=[POSLineItem(menu_item_id=11, quantity=1)],
        payment=payment,
    )


def _added(db, model):
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], model)]


@pytest.mark.asyncio
async def test_pos_stripe_qr_order_stays_pending_until_capture(monkeypatch):
    """A QR order is pending + initiated + prepaid; only the Payment row is
    pending_authorization, so the 2h prepaid sweep can expire it."""
    from app.api.routes.endpoints.staff import pos as pos_module

    monkeypatch.setattr(pos_module, "_deduct_stock_for_order", AsyncMock(return_value=[]))
    monkeypatch.setattr(pos_module, "_award_pos_loyalty_points", AsyncMock(return_value=0))
    monkeypatch.setattr(
        pos_module,
        "create_stripe_checkout_session",
        AsyncMock(return_value={"id": "cs_test_1", "url": "https://checkout.stripe.com/test"}),
    )
    monkeypatch.setattr("app.core.security.create_guest_pay_token", lambda *a: "tok")

    db = _pos_db()
    staff = SimpleNamespace(store_id=3)

    resp = await pos_module.staff_pos_create_order(
        db, staff, _pos_request("stripe_qr"), Response()
    )

    order = _added(db, Order)[0]
    assert order.status == "pending"
    assert order.payment_status == "initiated"
    assert order.payment_flow == "prepaid"
    payment = _added(db, Payment)[0]
    assert payment.status == "pending_authorization"
    assert resp.data["status"] == "pending"
    assert resp.data["payment_url"] == "https://checkout.stripe.com/test"


@pytest.mark.asyncio
async def test_pos_cash_order_still_confirmed_and_captured(monkeypatch):
    """Regression contrast: pay-now POS orders keep confirmed + captured."""
    from app.api.routes.endpoints.staff import pos as pos_module

    monkeypatch.setattr(pos_module, "_deduct_stock_for_order", AsyncMock(return_value=[]))
    monkeypatch.setattr(pos_module, "_award_pos_loyalty_points", AsyncMock(return_value=0))
    monkeypatch.setattr(pos_module, "_add_payment_event", AsyncMock())
    # Imported locally inside the endpoint — patch at the source modules.
    monkeypatch.setattr("app.services.payment._grant_coffee_pass_if_purchased", AsyncMock())
    monkeypatch.setattr("app.services.order._convert_referral_on_first_paid_order", AsyncMock())
    monkeypatch.setattr("app.services.payment._accrue_loyalty_annual_spend", AsyncMock())
    monkeypatch.setattr("app.services.lucky_draw.grant_tickets_for_order", AsyncMock())

    db = _pos_db()
    staff = SimpleNamespace(store_id=3)

    resp = await pos_module.staff_pos_create_order(
        db, staff, _pos_request("cash"), Response()
    )

    order = _added(db, Order)[0]
    assert order.status == "confirmed"
    assert order.payment_status == "captured"
    assert resp.data["status"] == "confirmed"


# ---------------------------------------------------------------------------
# C2 — kiosk idempotency key
# ---------------------------------------------------------------------------


def test_kiosk_request_accepts_idempotency_key():
    """extra="ignore" must not silently drop the key (double-tap duplicates)."""
    from app.api.routes.endpoints.public.kiosk import KioskOrderCreateRequest

    req = KioskOrderCreateRequest(
        store_id=3,
        order_type="takeaway",
        items=[{"menu_item_id": 11, "quantity": 1}],
        idempotency_key="kiosk-abc-123",
    )
    assert req.idempotency_key == "kiosk-abc-123"


@pytest.mark.asyncio
async def test_create_order_replays_idempotency_key(fake_config):
    """A retry with the same key returns the existing order, no new Order."""
    cart = SimpleNamespace(
        id=1, customer_id=7, store_id=3, item_count=1, subtotal=Decimal("10.00")
    )
    existing = SimpleNamespace(id=42, customer_id=7)

    db = _async_db()
    db.execute.side_effect = [
        _FakeResult(one=cart),      # cart fetch
        _FakeResult(one=existing),  # idempotency replay lookup
    ]
    data = OrderCreate(
        store_id=3, cart_id=1, order_type="takeaway", idempotency_key="kiosk-abc-123"
    )

    order = await create_order_from_cart(db, 7, data)

    assert order is existing
    assert _added(db, Order) == []


# ---------------------------------------------------------------------------
# C3 — dining table validation / C4 — in-transaction lock / C5 — status log
# ---------------------------------------------------------------------------


def _cart_db(*, table=None):
    """Mock db for a 1-item dine-in checkout with dining_table_id=9.

    ``table=None`` simulates a missing/foreign/inactive table (the filtered
    validation query finds no row).
    """
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
        _FakeResult(one=table),           # dining table validation
        _FakeResult(rows=[cart_item]),    # cart line items
        _FakeResult(all_rows=[]),         # members-only locked items
        _FakeResult(rows=[]),             # store configuration
        _FakeResult(rows=[menu_item]),    # menu items for snapshots
        _FakeResult(one=None),            # experiences category
        _FakeResult(rows=[]),             # menu item recipes (stock)
        _FakeResult(one=None),            # loyalty account (points display)
        _FakeResult(one=None),            # table status snapshot upsert
    ]
    db.get = AsyncMock(return_value=customer)
    return db


@pytest.mark.asyncio
async def test_create_order_rejects_unknown_or_foreign_table(fake_config):
    """A table that is missing/inactive/deleted/another store's is a 400."""
    db = _cart_db(table=None)
    data = OrderCreate(
        store_id=3, cart_id=1, order_type="dine_in",
        fulfillment_type="dine_in_service", dining_table_id=9,
    )

    with pytest.raises(OrderError) as exc_info:
        await create_order_from_cart(db, 7, data, order_channel="kiosk", kiosk_mode="tablet")

    assert exc_info.value.status_code == 400
    assert _added(db, Order) == []


@pytest.mark.asyncio
async def test_create_order_locks_valid_table_inside_transaction(fake_config):
    """Valid table: snapshot upsert happens before the single commit (C4),
    and the initial status log records the real open-tab status (C5)."""
    table = SimpleNamespace(id=9, store_id=3, is_active=True)
    db = _cart_db(table=table)

    added = []
    db.add = MagicMock(side_effect=lambda obj: added.append(obj))
    snap_added_before_commit = []
    db.commit = AsyncMock(
        side_effect=lambda: snap_added_before_commit.append(
            any(isinstance(o, TableStatusSnapshot) for o in added)
        )
    )

    data = OrderCreate(
        store_id=3, cart_id=1, order_type="dine_in",
        fulfillment_type="dine_in_service", dining_table_id=9,
    )
    order = await create_order_from_cart(
        db, 7, data, order_channel="kiosk", kiosk_mode="tablet"
    )

    snaps = [o for o in added if isinstance(o, TableStatusSnapshot)]
    assert len(snaps) == 1
    assert snaps[0].table_id == 9
    assert snaps[0].status == "occupied"
    assert db.commit.await_count == 1  # one atomic commit, not order-then-lock
    assert snap_added_before_commit == [True]

    logs = [o for o in added if isinstance(o, OrderStatusLog)]
    assert len(logs) == 1
    assert logs[0].to_status == "confirmed" == order.status  # open tab, not "pending"
