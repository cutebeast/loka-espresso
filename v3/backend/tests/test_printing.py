"""Unit tests for receipt printing + cash-drawer integration.

Covers: receipt composer output shape (Star markup), the print job lifecycle
(enqueue → poll → content → ACK), printer-token auth, and the requeue cap.
"""

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.models.print_job import PrintJob
from app.services.printing import MAX_ATTEMPTS, confirm_job, enqueue_job
from app.services.receipt import compose_drawer_kick, compose_receipt


# ---------------------------------------------------------------------------
# Receipt composer
# ---------------------------------------------------------------------------


def _fake_store():
    return SimpleNamespace(
        store_name="Loka Espresso PKL",
        brand_name="Loka Espresso",
        address_line_1="Lot 1, Jalan Test",
        address_line_2=None,
        city="Kuala Lumpur",
        postal_code="50000",
        phone_number="03-12345678",
        currency_code="MYR",
        timezone="Asia/Kuala_Lumpur",
    )


def _fake_order(**overrides):
    base = dict(
        order_number="POS-0827-ABC123",
        created_at=datetime(2026, 8, 27, 10, 30, tzinfo=timezone.utc),
        order_type="takeaway",
        items_subtotal=Decimal("24.00"),
        modifier_subtotal=Decimal("4.00"),
        discount_amount=Decimal("2.00"),
        voucher_discount=Decimal("0"),
        reward_discount=Decimal("5.00"),
        addon_discount=Decimal("0"),
        delivery_fee=Decimal("0"),
        service_charge=Decimal("0"),
        tax_amount=Decimal("1.44"),
        tip_amount=Decimal("1.00"),
        total_amount=Decimal("24.44"),
        total_amount_currency="MYR",
        loyalty_points_earned=24,
        dining_table_id=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _fake_line(**overrides):
    base = dict(
        item_snapshot={"item_name": "Latte", "variant_name": "Hot"},
        quantity=2,
        unit_price=Decimal("10.00"),
        line_total=Decimal("24.00"),
        selected_modifiers={"modifier_ids": [11]},
        special_instructions=None,
        menu_item_id=5,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_receipt_contains_header_lines_totals_and_payment():
    doc = compose_receipt(
        _fake_order(),
        _fake_store(),
        [_fake_line()],
        {11: SimpleNamespace(option_name="Oat Milk")},
        payment_method="Cash",
    )
    # Store header
    assert "Loka Espresso PKL" in doc
    assert "Lot 1, Jalan Test" in doc
    assert "Kuala Lumpur 50000" in doc
    # Order meta — 10:30 UTC rendered in the store timezone (+8)
    assert "POS-0827-ABC123" in doc
    assert "18:30" in doc
    assert "Takeaway" in doc
    # Lines: item with variant + modifier sub-line
    assert "2 x Latte (Hot)" in doc
    assert "+ Oat Milk" in doc
    # Totals incl. discount/reward/tax/tip
    assert "Subtotal" in doc and "24.00" in doc
    assert "-2.00" in doc and "Reward" in doc and "-5.00" in doc
    assert "Tax" in doc and "1.44" in doc
    assert "Tip" in doc and "1.00" in doc
    assert "MYR 24.44" in doc
    # Payment + loyalty + cut
    assert "Cash" in doc
    assert "Points Earned" in doc and "24" in doc
    assert "[cut: feed; partial]" in doc


def test_receipt_uses_column_markup_not_space_padding():
    doc = compose_receipt(_fake_order(), _fake_store(), [_fake_line()], {})
    assert "[column: left: 2 x Latte (Hot); right: 24.00]" in doc
    assert "[column: left: Total; right: MYR 24.44]" in doc


def test_receipt_cash_kicks_drawer_card_does_not():
    cash_doc = compose_receipt(_fake_order(), _fake_store(), [], {}, include_drawer=True)
    card_doc = compose_receipt(_fake_order(), _fake_store(), [], {}, include_drawer=False)
    assert cash_doc.startswith("[drawer]")
    assert "[drawer]" not in card_doc


def test_receipt_reprint_marker():
    doc = compose_receipt(_fake_order(), _fake_store(), [], {}, reprint=True)
    assert "REPRINT" in doc


def test_receipt_escapes_markup_hostile_characters():
    line = _fake_line(item_snapshot={"item_name": "Test [X]; Y\\Z"}, quantity=1)
    doc = compose_receipt(_fake_order(), _fake_store(), [line], {})
    assert "Test \\[X\\], Y\\\\Z" in doc


def test_drawer_kick_only_job():
    assert compose_drawer_kick() == "[drawer]\n"


# ---------------------------------------------------------------------------
# Job queue service (mocked DB)
# ---------------------------------------------------------------------------


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _fake_result(value=None):
    class Result:
        def scalar_one_or_none(self):
            return value
    return Result()


def _queued_job(attempts=0, status="queued"):
    return PrintJob(
        id=7,
        store_id=1,
        printer_token="tok-abc",
        type="receipt",
        status=status,
        payload="hello",
        content_type="text/vnd.star.markup",
        order_id=42,
        attempts=attempts,
    )


@pytest.mark.asyncio
async def test_enqueue_job_builds_queued_job():
    db = _async_db()
    job = await enqueue_job(
        db,
        store_id=1,
        printer_token="tok-abc",
        job_type="receipt",
        payload="body",
        order_id=42,
    )
    assert job is db.add.call_args[0][0]
    assert job.status == "queued"
    assert job.type == "receipt"
    assert job.content_type == "text/vnd.star.markup"
    assert job.order_id == 42
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_confirm_job_success_marks_printed():
    db = _async_db()
    job = _queued_job()
    db.execute.return_value = _fake_result(job)

    result = await confirm_job(db, "tok-abc", 7, "200 OK")

    assert result.status == "printed"
    assert result.printed_at is not None
    assert result.error is None


@pytest.mark.asyncio
async def test_confirm_job_failure_requeues_with_attempt():
    db = _async_db()
    job = _queued_job()
    db.execute.return_value = _fake_result(job)

    result = await confirm_job(db, "tok-abc", 7, "510 Paper Jam")

    assert result.status == "queued"
    assert result.attempts == 1
    assert "510 Paper Jam" in result.error


@pytest.mark.asyncio
async def test_confirm_job_fails_permanently_at_requeue_cap():
    db = _async_db()
    job = _queued_job(attempts=MAX_ATTEMPTS - 1)
    db.execute.return_value = _fake_result(job)

    result = await confirm_job(db, "tok-abc", 7, "510 Paper Jam")

    assert result.status == "failed"
    assert result.attempts == MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_confirm_job_double_ack_is_idempotent():
    db = _async_db()
    job = _queued_job(status="printed")
    db.execute.return_value = _fake_result(job)

    result = await confirm_job(db, "tok-abc", 7, "200 OK")

    assert result.status == "printed"
    assert result.printed_at is None  # untouched second time


@pytest.mark.asyncio
async def test_confirm_job_wrong_token_returns_none():
    db = _async_db()
    db.execute.return_value = _fake_result(None)

    assert await confirm_job(db, "tok-other", 7, "200 OK") is None


# ---------------------------------------------------------------------------
# CloudPRNT endpoints (router mounted on a bare app, services monkeypatched)
# ---------------------------------------------------------------------------


@pytest.fixture
def print_app(monkeypatch):
    from app.api.routes.endpoints import print_cloudprnt
    from app.api.routes.deps import get_async_db

    async def _fake_get_db():
        db = AsyncMock()
        db.add = MagicMock()
        yield db

    app = FastAPI()
    app.dependency_overrides[get_async_db] = _fake_get_db
    app.include_router(print_cloudprnt.router, prefix="/api/print/cloudprnt")

    active = {"name": "Counter 1", "token": "tok-abc", "active": True, "store_id": 1}
    monkeypatch.setattr(
        print_cloudprnt, "find_printer_by_token",
        AsyncMock(side_effect=lambda db, token: active if token == "tok-abc" else None),
    )
    monkeypatch.setattr(print_cloudprnt, "touch_printer_last_seen", AsyncMock())
    return app, print_cloudprnt, monkeypatch


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_poll_unknown_token_404(print_app):
    app, _, _ = print_app
    async with _client(app) as client:
        res = await client.post("/api/print/cloudprnt/nope")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_poll_no_job(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(mod, "next_queued_job", AsyncMock(return_value=None))
    async with _client(app) as client:
        res = await client.post("/api/print/cloudprnt/tok-abc", json={"statusCode": "200 OK"})
    assert res.status_code == 200
    body = res.json()
    assert body["jobReady"] is False
    assert "application/vnd.star.line" in body["mediaTypes"]
    assert "text/vnd.star.markup" in body["mediaTypes"]
    assert "jobToken" not in body


@pytest.mark.asyncio
async def test_poll_offers_queued_job(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(mod, "next_queued_job", AsyncMock(return_value=_queued_job()))
    async with _client(app) as client:
        res = await client.post("/api/print/cloudprnt/tok-abc", json={"statusCode": "200 OK"})
    body = res.json()
    assert body["jobReady"] is True
    assert body["jobToken"] == "7"


@pytest.mark.asyncio
async def test_job_content_served_with_content_type(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(mod, "get_queued_job", AsyncMock(return_value=_queued_job()))
    async with _client(app) as client:
        res = await client.get("/api/print/cloudprnt/tok-abc?type=text/vnd.star.markup&token=7")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/vnd.star.markup")
    assert res.text == "hello"


@pytest.mark.asyncio
async def test_job_content_unknown_token_404(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(mod, "get_queued_job", AsyncMock(return_value=None))
    async with _client(app) as client:
        res = await client.get("/api/print/cloudprnt/tok-abc?type=text/vnd.star.markup&token=7")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_confirms_job(print_app):
    app, mod, monkeypatch = print_app
    confirm = AsyncMock(return_value=_queued_job(status="printed"))
    monkeypatch.setattr(mod, "confirm_job", confirm)
    async with _client(app) as client:
        res = await client.delete("/api/print/cloudprnt/tok-abc?token=7&code=200%20OK")
    assert res.status_code == 200
    confirm.assert_awaited_once()
    assert confirm.call_args[0][2] == 7
    assert confirm.call_args[0][3] == "200 OK"


@pytest.mark.asyncio
async def test_delete_unknown_job_404(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(mod, "confirm_job", AsyncMock(return_value=None))
    async with _client(app) as client:
        res = await client.delete("/api/print/cloudprnt/tok-abc?token=99&code=200%20OK")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_post_status_callback_with_json_code(print_app):
    app, mod, monkeypatch = print_app
    confirm = AsyncMock(return_value=_queued_job(attempts=1))
    monkeypatch.setattr(mod, "confirm_job", confirm)
    async with _client(app) as client:
        res = await client.post(
            "/api/print/cloudprnt/tok-abc/job/7", json={"code": "511 Media Error"}
        )
    assert res.status_code == 200
    assert confirm.call_args[0][3] == "511 Media Error"


@pytest.mark.asyncio
async def test_inactive_printer_rejected(print_app):
    app, mod, monkeypatch = print_app
    monkeypatch.setattr(
        mod, "find_printer_by_token",
        AsyncMock(return_value={"name": "Old", "token": "tok-abc", "active": False, "store_id": 1}),
    )
    async with _client(app) as client:
        res = await client.post("/api/print/cloudprnt/tok-abc")
    assert res.status_code == 404
