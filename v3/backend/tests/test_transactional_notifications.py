"""Unit tests for the transactional notification dispatcher."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.transactional_notifications import notify_event


class _R:
    def __init__(self, one=None, row=None, all_rows=None, scalar=None):
        self._one = one
        self._row = row
        self._all = all_rows or []
        self._scalar = scalar if scalar is not None else one

    def scalar_one_or_none(self):
        return self._one

    def scalar_one(self):
        return self._scalar

    def first(self):
        return self._row

    def scalars(self):
        class _S:
            def all(s):
                return self._all
            def first(s):
                return self._all[0] if self._all else None
        return _S()


def _db():
    db = AsyncMock()
    db.begin_nested = AsyncMock(return_value=AsyncMock())
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


def _template(**kw):
    t = SimpleNamespace(
        id=7, title="Hello {customer_name}", body="Body {x}",
        image_url=None, priority="normal", channels=["in_app"],
        action_url_template="#vip",
    )
    for k, v in kw.items():
        setattr(t, k, v)
    return t


@pytest.mark.asyncio
async def test_notify_event_skips_when_no_customer():
    db = _db()
    assert await notify_event(db, "order_ready", None) is None
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_event_unknown_event_key_logs_and_skips():
    db = _db()
    assert await notify_event(db, "no_such_event", 5) is None
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_event_idempotent_on_existing_log():
    db = _db()
    db.execute = AsyncMock(return_value=_R(one=1))  # existing events-log row
    assert await notify_event(db, "order_ready", 5, entity_type="order", entity_id="9") is None
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_notify_event_skips_when_no_template():
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=None),   # no existing event log row
        _R(one=None),   # no template
    ])
    assert await notify_event(db, "order_ready", 5, entity_type="order", entity_id="9") is None


@pytest.mark.asyncio
async def test_notify_event_creates_interpolated_message_and_log():
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=None),                                   # no existing event log
        _R(one=_template()),                            # template
        _R(row=("Test User", "en")),                    # customer row
    ])
    result = await notify_event(
        db, "order_ready", 5,
        context={"x": "pickup"},
        entity_type="order", entity_id="9",
    )
    assert result is not None
    assert result.title == "Hello Test User"
    assert result.body == "Body pickup"
    assert result.template_id == 7
    assert result.action_url == "#vip"
    added = [c.args[0] for c in db.add.call_args_list]
    from app.models.notification import NotificationEventsLog
    logs = [a for a in added if isinstance(a, NotificationEventsLog)]
    assert len(logs) == 1
    assert logs[0].event_key == "order_ready"
    assert logs[0].entity_type == "order"
    assert logs[0].entity_id == "9"
    assert logs[0].customer_id == 5


@pytest.mark.asyncio
async def test_notify_event_disabled_template_skips():
    db = _db()
    db.execute = AsyncMock(side_effect=[
        _R(one=None),
        _R(one=None),  # enabled-template query finds nothing (disabled filtered)
    ])
    assert await notify_event(db, "order_ready", 5, entity_type="order", entity_id="9") is None
