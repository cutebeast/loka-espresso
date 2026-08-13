"""Unit tests for admin/customer notification endpoints (send idempotency,
preference upsert keying, translation merge keying)."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.routes.endpoints.admin.notifications import (
    list_my_notifications,
    send_notification,
    update_my_preferences,
)
from app.models.notification import NotificationMessage, NotificationPreference
from app.schemas.notification import NotificationPreferenceUpdate


class _FakeResult:
    def __init__(self, items=None, one=None, scalar=None):
        self._items = items
        self._one = one
        self._scalar = scalar

    def scalars(self):
        return self

    def all(self):
        return self._items or []

    def scalar_one_or_none(self):
        return self._one

    def scalar(self):
        return self._scalar


def _async_db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


def _prefs_db(existing_items):
    """DB fake for preference tests — refresh fills server-generated columns
    the way a real flush/refresh would."""
    db = _async_db()
    db.execute.return_value = _FakeResult(items=existing_items)

    async def _refresh(pref):
        if getattr(pref, "id", None) is None:
            pref.id = 1
        now = datetime.now(timezone.utc)
        if getattr(pref, "created_at", None) is None:
            pref.created_at = now
        if getattr(pref, "updated_at", None) is None:
            pref.updated_at = now

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


# ---------------------------------------------------------------------------
# send idempotency (re-send must not duplicate messages / re-fire paid channels)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_notification_already_sent_returns_409():
    db = _async_db()
    notif = SimpleNamespace(id=9, status="sent")
    db.execute.return_value = _FakeResult(one=notif)

    with pytest.raises(HTTPException) as exc_info:
        await send_notification(db=db, admin=SimpleNamespace(id=1), notif_id=9)

    assert exc_info.value.status_code == 409
    db.add.assert_not_called()


# ---------------------------------------------------------------------------
# preferences upsert keyed by (channel, message_category)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_preferences_creates_rows_per_channel():
    """Items with channel info create their own rows; items without fall back
    to (push_notification, all)."""
    db = _prefs_db([])  # no existing prefs
    customer = SimpleNamespace(id=7)

    data = [
        NotificationPreferenceUpdate(channel="sms", is_enabled=False),
        NotificationPreferenceUpdate(is_enabled=True),
    ]
    resp = await update_my_preferences(customer=customer, db=db, data=data)

    added = [call.args[0] for call in db.add.call_args_list]
    assert [(p.channel, p.message_category) for p in added] == [
        ("sms", "all"),
        ("push_notification", "all"),
    ]
    assert added[0].is_enabled is False
    assert len(resp.data) == 2


@pytest.mark.asyncio
async def test_update_preferences_updates_matching_row_only():
    """An update targets the row with the same (channel, category) instead of
    clobbering the first existing row."""
    db = _async_db()
    push_pref = NotificationPreference(
        customer_id=7, channel="push_notification", message_category="all",
        is_enabled=True, timezone="UTC",
    )
    sms_pref = NotificationPreference(
        customer_id=7, channel="sms", message_category="all",
        is_enabled=True, timezone="UTC",
    )
    db = _prefs_db([push_pref, sms_pref])
    customer = SimpleNamespace(id=7)

    data = [NotificationPreferenceUpdate(channel="sms", is_enabled=False)]
    resp = await update_my_preferences(customer=customer, db=db, data=data)

    db.add.assert_not_called()
    assert sms_pref.is_enabled is False
    assert push_pref.is_enabled is True
    assert resp.data[0].channel == "sms"


@pytest.mark.asyncio
async def test_update_preferences_invalid_channel_falls_back():
    """Unknown channel values (e.g. legacy 'push') map to the default row
    instead of 422ing or writing an invalid row."""
    db = _prefs_db([])
    customer = SimpleNamespace(id=7)

    data = [NotificationPreferenceUpdate(channel="push", message_category="promotions", is_enabled=False)]
    resp = await update_my_preferences(customer=customer, db=db, data=data)

    added = [call.args[0] for call in db.add.call_args_list]
    assert [(p.channel, p.message_category) for p in added] == [("push_notification", "promotions")]
    assert resp.data[0].is_enabled is False


# ---------------------------------------------------------------------------
# inbox translations keyed by the parent admin notification id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_my_notifications_translates_via_campaign_id():
    """zh translations live on admin_notifications (record_id == campaign_id),
    not on the per-customer message id."""
    db = _async_db()
    msg = NotificationMessage(
        id=12345,  # deliberately different from the parent notification id
        customer_id=7,
        message_type="system",
        priority="normal",
        title="Hello",
        body="English body",
        is_read=False,
        campaign_id=99,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    translation = SimpleNamespace(record_id=99, column_name="title", translated_text="你好")
    db.execute.side_effect = [
        _FakeResult(scalar=1),        # count
        _FakeResult(items=[msg]),     # page of messages
        _FakeResult(items=[translation]),  # translations for admin_notifications
    ]
    customer = SimpleNamespace(id=7)

    resp = await list_my_notifications(
        customer=customer, db=db, locale="zh", is_read=None, page=1, per_page=20
    )

    item = resp.data.items[0]
    assert item["id"] == 12345
    assert item["title"] == "你好"
    assert item["body"] == "English body"  # untranslated column untouched
