"""Web Push (VAPID) delivery helpers.

VAPID keys are DB-first (platform_config `vapid.private_key` / `vapid.public_key`
/ `vapid.subject` — editable from Admin → Settings), with environment fallbacks
for bootstrapping before the admin sets them.
"""

import json
from typing import Any

import logging

from pywebpush import WebPushException, webpush

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _vapid_setting(name: str, env_attr: str) -> str | None:
    """Sync resolution helper — platform_config is checked by callers that
    have a DB session; these helpers cover the settings fallback."""
    return getattr(get_settings(), env_attr, None) or None


async def _vapid_from_config(db, name: str, env_attr: str) -> str | None:
    from app.services.platform_config import PlatformConfigService

    value = await PlatformConfigService(db).get_str(f"vapid.{name}", default="")
    if value:
        return value
    return getattr(get_settings(), env_attr, None)


async def get_vapid_public_key(db) -> str | None:
    return await _vapid_from_config(db, "public_key", "vapid_public_key")


async def _vapid_private_key(db) -> str | None:
    return await _vapid_from_config(db, "private_key", "vapid_private_key")


async def _vapid_claims(db) -> dict[str, str]:
    subject = await _vapid_from_config(db, "subject", "vapid_subject")
    return {"sub": subject}


def get_vapid_public_key_sync() -> str | None:
    """Settings-only fallback for callers without a DB session."""
    return get_settings().vapid_public_key


async def send_web_push(db, subscription: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Send a single web push notification.

    Returns a dict with ``success`` boolean and optional ``error`` details.
    """
    private_key = await _vapid_private_key(db)
    if not private_key:
        logger.warning("VAPID private key not configured; cannot send web push")
        return {"success": False, "error": "VAPID private key not configured"}

    try:
        # pywebpush performs blocking network I/O — run it on a worker thread
        # so a blast to a large audience never stalls the event loop.
        import asyncio

        result = await asyncio.to_thread(
            webpush,
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims=await _vapid_claims(db),
            ttl=60 * 60,
        )
        return {"success": True, "status_code": result.status_code if result else None}
    except WebPushException as exc:
        logger.warning("Web push delivery failed: %s", exc, exc_info=False)
        return {"success": False, "error": str(exc)}
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected web push failure")
        return {"success": False, "error": str(exc)}
