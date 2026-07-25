"""Outbound messaging channels — Twilio SMS / WhatsApp.

Shared by marketing campaigns and the admin notification fan-out. Credentials
live in platform_config (integration.twilio_* / integration.twilio_test_*)
and honor the integration.twilio_use_test_credentials toggle.
"""

import logging

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
