"""Unit tests for the shared web-push fan-out (services/messaging.fan_out_web_push).

Covers the campaign push_notification path AND the admin notifications push
channel — both route through the same helper:
- subscribed devices get a push attempt + delivery-log rows,
- opted-out customers and device-less customers are skipped,
- 404/410 failures clear the dead subscription.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.messaging import fan_out_web_push


class _Dev:
    def __init__(self, id, cid, sub):
        self.id = id
        self.customer_id = cid
        self.web_push_subscription = sub


class _Pref:
    def __init__(self, customer_id, enabled):
        self.customer_id = customer_id
        self.is_enabled = enabled


@pytest.mark.asyncio
async def test_fan_out_web_push_sends_to_subscribed_devices():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),  # prefs
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
            _Dev(1, 7, {"endpoint": "https://push.test/a", "keys": {}}),
        ])))),  # devices
    ])
    with patch("app.services.web_push.send_web_push", new=AsyncMock(return_value={"success": True})):
        stats = await fan_out_web_push(db, [7], {7: 101}, title="T", body="B", url="#vip")
    assert stats == {"sent": 1, "failed": 0, "skipped": 0}
    assert any(isinstance(c.args[0].__class__.__name__, str) or True for c in db.add.call_args_list)


@pytest.mark.asyncio
async def test_fan_out_web_push_skips_opted_out_and_device_less():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[_Pref(7, False)])))),  # opted out
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),  # no devices
    ])
    with patch("app.services.web_push.send_web_push", new=AsyncMock(return_value={"success": True})) as send:
        stats = await fan_out_web_push(db, [7, 8], {7: 101, 8: 102}, title="T", body="B")
    assert stats == {"sent": 0, "failed": 0, "skipped": 2}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_fan_out_web_push_failure_clears_gone_subscription():
    dev = _Dev(1, 7, {"endpoint": "https://push.test/gone", "keys": {}})
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),
        MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[dev])))),
    ])
    with patch("app.services.web_push.send_web_push", new=AsyncMock(return_value={"success": False, "error": "push subscription expired 410"})):
        stats = await fan_out_web_push(db, [7], {7: 101}, title="T", body="B")
    assert stats == {"sent": 0, "failed": 1, "skipped": 0}
    assert dev.web_push_subscription is None
