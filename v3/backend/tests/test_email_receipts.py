"""Unit tests for the order receipt email hook (app.services.email)."""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import email as email_svc


class _R:
    def __init__(self, one=None, all_rows=None):
        self._one = one
        self._all = all_rows or []

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        class _S:
            def all(s):
                return self._all
        return _S()

    def all(self):
        return self._all


def _db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


class _Config:
    def __init__(self, enabled=True, symbol="RM"):
        self._enabled = enabled
        self._symbol = symbol

    async def get_bool(self, key, default=False):
        assert key == "email.receipts_enabled"
        return self._enabled

    async def get_str(self, key, default=""):
        return self._symbol


def _order(**kw):
    o = SimpleNamespace(
        id=42, order_number="ORD-1001", customer_id=7, store_id=3,
        payment_status="captured", deleted_at=None,
        items_subtotal=Decimal("10.00"), modifier_subtotal=Decimal("2.00"),
        discount_amount=Decimal("1.00"), voucher_discount=Decimal("0"),
        reward_discount=Decimal("0"), addon_discount=Decimal("0"),
        delivery_fee=Decimal("0"), service_charge=Decimal("0"),
        tax_amount=Decimal("0.66"), tip_amount=Decimal("0"),
        total_amount=Decimal("11.66"), total_amount_currency="MYR",
        loyalty_points_earned=12,
        created_at=datetime(2026, 8, 27, 8, 30, tzinfo=timezone.utc),
    )
    for k, v in kw.items():
        setattr(o, k, v)
    return o


def _payment(**kw):
    p = SimpleNamespace(
        id=99, order_id=42, status="captured", provider="cash",
        extra_metadata=None,
    )
    for k, v in kw.items():
        setattr(p, k, v)
    return p


def _customer(**kw):
    c = SimpleNamespace(
        id=7, email_address="alice@example.com", preferred_language="en",
        display_name="Alice",
    )
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def _line_item(**kw):
    li = SimpleNamespace(
        id=1, order_id=42, menu_item_id=5,
        item_snapshot={"item_name": "Latte", "variant_name": "Hot"},
        quantity=2, unit_price=Decimal("5.00"), modifier_total=Decimal("1.00"),
        line_total=Decimal("12.00"),
        selected_modifiers={"1": [{"option_id": 11, "option_name": "Oat Milk", "price_adjustment": 1.0}]},
    )
    for k, v in kw.items():
        setattr(li, k, v)
    return li


@pytest.fixture
def send_mock(monkeypatch):
    mock = AsyncMock(return_value=True)
    monkeypatch.setattr(email_svc, "send_email_via_resend", mock)
    return mock


def _patch_config(monkeypatch, cfg):
    monkeypatch.setattr(email_svc, "PlatformConfigService", lambda db: cfg)


@pytest.mark.asyncio
async def test_receipt_skipped_when_disabled(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=False))
    db = _db()
    result = await email_svc.send_order_receipt_email(db, _order(), _payment())
    assert result is False
    send_mock.assert_not_awaited()
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_receipt_sent_on_capture(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=_customer()),            # customer
        _R(one="Loka Espresso PKL"),    # store name
        _R(all_rows=[_line_item()]),    # line items (dict modifiers → no lookup)
    ])
    order, payment = _order(), _payment()
    result = await email_svc.send_order_receipt_email(db, order, payment)
    assert result is True
    send_mock.assert_awaited_once()
    args, kwargs = send_mock.await_args
    assert args[0] == "alice@example.com"
    assert "ORD-1001" in args[1]            # subject carries order number
    html = kwargs["html_body"]
    assert "Latte (Hot)" in html
    assert "Oat Milk" in html               # modifier rendered
    assert "RM 11.66" in html               # total
    assert "RM 0.66" in html                # tax
    assert "12" in html                     # points earned
    assert "Cash" in html                   # payment method
    assert kwargs["tags"]["type"] == "order_receipt"
    # Idempotency marker written + persisted
    assert payment.extra_metadata["receipt_email_sent_at"]
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_receipt_zh_locale(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=_customer(preferred_language="zh")),
        _R(one="Loka Espresso PKL"),
        _R(all_rows=[_line_item()]),
    ])
    result = await email_svc.send_order_receipt_email(db, _order(), _payment())
    assert result is True
    args, kwargs = send_mock.await_args
    assert "收据" in args[1]
    assert "合计" in kwargs["html_body"]
    assert "现金" in kwargs["html_body"]


@pytest.mark.asyncio
async def test_receipt_modifier_ids_resolved(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    li = _line_item(selected_modifiers={"1": [11]})  # cart shape: ids only
    db.execute = AsyncMock(side_effect=[
        _R(one=_customer()),
        _R(one="Loka Espresso PKL"),
        _R(all_rows=[li]),
        _R(all_rows=[(11, "Extra Shot")]),  # ModifierOption id/name lookup
    ])
    result = await email_svc.send_order_receipt_email(db, _order(), _payment())
    assert result is True
    assert "Extra Shot" in send_mock.await_args.kwargs["html_body"]


@pytest.mark.asyncio
async def test_receipt_skipped_without_email(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    db.execute = AsyncMock(side_effect=[_R(one=_customer(email_address=None))])
    result = await email_svc.send_order_receipt_email(db, _order(), _payment())
    assert result is False
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_receipt_skipped_for_guest_customer_row_missing(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    db.execute = AsyncMock(side_effect=[_R(one=None)])  # no customer row
    result = await email_svc.send_order_receipt_email(db, _order(), _payment())
    assert result is False
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_receipt_idempotent_on_marker(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    payment = _payment(extra_metadata={"receipt_email_sent_at": "2026-08-27T08:30:00+00:00"})
    result = await email_svc.send_order_receipt_email(db, _order(), payment)
    assert result is False
    send_mock.assert_not_awaited()
    db.execute.assert_not_awaited()  # duplicate webhook never reaches the queries


@pytest.mark.asyncio
async def test_receipt_skipped_when_order_not_fully_paid(monkeypatch, send_mock):
    _patch_config(monkeypatch, _Config(enabled=True))
    db = _db()
    order = _order(payment_status="initiated")  # split bill, first capture
    result = await email_svc.send_order_receipt_email(db, order, _payment())
    assert result is False
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_receipt_failure_never_raises(monkeypatch):
    _patch_config(monkeypatch, _Config(enabled=True))
    boom = AsyncMock(side_effect=RuntimeError("resend down"))
    monkeypatch.setattr(email_svc, "send_email_via_resend", boom)
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=_customer()),
        _R(one="Loka Espresso PKL"),
        _R(all_rows=[_line_item()]),
    ])
    payment = _payment()
    result = await email_svc.send_order_receipt_email(db, _order(), payment)
    assert result is False
    assert payment.extra_metadata is None  # no marker → a later retry may resend
