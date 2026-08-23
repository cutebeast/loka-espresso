"""Outbound messaging channels — Twilio SMS / WhatsApp.

Shared by marketing campaigns and the admin notification fan-out. Credentials
live in platform_config (integration.twilio_* / integration.twilio_test_*)
and honor the integration.twilio_use_test_credentials toggle.
"""

import logging
import re

from httpx import AsyncClient
from sqlalchemy import select

from app.models.platform import PlatformConfig

logger = logging.getLogger(__name__)


async def get_twilio_credentials(db) -> tuple[str, str, str, str]:
    """Return (account_sid, auth_token, sms_from, whatsapp_from), honoring the
    integration.twilio_use_test_credentials toggle. Empty strings when unset."""
    use_test_result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key == "integration.twilio_use_test_credentials")
    )
    use_test_row = use_test_result.scalar_one_or_none()
    use_test = bool(
        use_test_row and str(use_test_row.config_value).lower() in ("true", "1", "yes", "on")
    )

    if use_test:
        keys = [
            "integration.twilio_test_account_sid",
            "integration.twilio_test_auth_token",
            "integration.twilio_test_from_number",
            "integration.twilio_test_whatsapp_from",
        ]
    else:
        keys = [
            "integration.twilio_account_sid",
            "integration.twilio_auth_token",
            "integration.twilio_from_number",
            "integration.twilio_whatsapp_from",
        ]

    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key.in_(keys))
    )
    rows = {r.config_key: str(r.config_value or "") for r in result.scalars().all()}
    return (
        rows.get(keys[0], ""),
        rows.get(keys[1], ""),
        rows.get(keys[2], ""),
        rows.get(keys[3], ""),
    )


async def _get_twilio_api_url(db, account_sid: str) -> str:
    """Get Twilio API URL from platform_config (template with {account_sid})."""
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.config_key == "integration.twilio_api_url")
    )
    row = result.scalar_one_or_none()
    if row and row.config_value:
        template = str(row.config_value).strip().strip('"')
        return template.format(account_sid=account_sid)
    return f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"


async def send_sms_via_twilio(
    account_sid: str, auth_token: str, from_number: str,
    to_number: str, body: str,
    db=None,
) -> bool:
    """Send an SMS (or WhatsApp message, using whatsapp: addresses) via the
    Twilio REST API. Returns True on success."""
    if not account_sid or not auth_token or not from_number:
        return False
    url = await _get_twilio_api_url(db, account_sid) if db else f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {"From": from_number, "To": to_number, "Body": body}
    auth = (account_sid, auth_token)
    try:
        async with AsyncClient(timeout=15) as client:
            resp = await client.post(url, data=data, auth=auth)
            return resp.status_code == 201
    except Exception:
        logger.error("SMS delivery failed via Twilio", exc_info=True)
        return False


async def send_whatsapp_via_twilio(
    account_sid: str, auth_token: str, whatsapp_from: str,
    phone: str, body: str,
    db=None,
) -> bool:
    """Send a WhatsApp message via Twilio. `whatsapp_from` is the configured
    sender (integration.twilio_whatsapp_from, already in whatsapp:+… form);
    the recipient phone gets the whatsapp: prefix added as needed."""
    wa_to = phone if phone.startswith("whatsapp:") else f"whatsapp:{phone}"
    return await send_sms_via_twilio(account_sid, auth_token, whatsapp_from, wa_to, body, db=db)


_GONE_PUSH_RE = re.compile(r"\b(404|410)\b")


async def fan_out_web_push(
    db,
    customer_ids: list[int],
    message_id_by_customer: dict[int, int],
    title: str,
    body: str,
    url: str = "/",
) -> dict[str, int]:
    """Send web-push to each customer's subscribed devices (campaigns +
    notifications share this path). Honors per-customer push opt-outs,
    clears dead (404/410) subscriptions, and writes delivery logs.
    Returns {"sent": N, "failed": N, "skipped": N}."""
    from datetime import datetime as _dt, timezone as _tz

    from app.models.customer import CustomerDevice
    from app.models.notification import NotificationDeliveryLog, NotificationPreference
    from app.services.web_push import send_web_push

    pref_result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.customer_id.in_(customer_ids),
            NotificationPreference.channel == "push_notification",
        )
    )
    opted_out = {p.customer_id for p in pref_result.scalars().all() if not p.is_enabled}

    dev_result = await db.execute(
        select(CustomerDevice).where(
            CustomerDevice.customer_id.in_(customer_ids),
            CustomerDevice.is_active.is_(True),
            CustomerDevice.deleted_at.is_(None),
            CustomerDevice.web_push_subscription.isnot(None),
        )
    )
    devices = [d for d in dev_result.scalars().all() if d.web_push_subscription]

    now = _dt.now(_tz.utc)
    stats = {"sent": 0, "failed": 0, "skipped": 0}
    push_payload = {"title": title, "body": body or "", "url": url or "/"}
    gone_re = _GONE_PUSH_RE

    for cid in customer_ids:
        mid = message_id_by_customer.get(cid)
        if cid in opted_out:
            stats["skipped"] += 1
            continue
        cust_devices = [d for d in devices if d.customer_id == cid]
        if not cust_devices:
            stats["skipped"] += 1
            continue
        for dev in cust_devices:
            endpoint = str((dev.web_push_subscription or {}).get("endpoint", ""))[:255]
            result = await send_web_push(db, dev.web_push_subscription, push_payload)
            ok = bool(result.get("success"))
            if not ok and gone_re.search(str(result.get("error") or "")):
                dev.web_push_subscription = None
            stats["sent" if ok else "failed"] += 1
            if mid is not None:
                db.add(NotificationDeliveryLog(
                    message_id=mid,
                    channel="push_notification",
                    device_id=dev.id,
                    recipient_address=endpoint,
                    status="sent" if ok else "failed",
                    provider="webpush",
                    error_message=None if ok else str(result.get("error", ""))[:500],
                    sent_at=now if ok else None,
                ))
    return stats
