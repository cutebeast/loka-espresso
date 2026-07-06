"""Web Push (VAPID) delivery helpers."""

import json
from typing import Any

import logging

from pywebpush import WebPushException, webpush

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def get_vapid_public_key() -> str | None:
    return get_settings().vapid_public_key


def _vapid_claims() -> dict[str, str]:
    return {"sub": get_settings().vapid_subject}


def _vapid_private_key() -> str | None:
    return get_settings().vapid_private_key


def send_web_push(subscription: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Send a single web push notification.

    Returns a dict with ``success`` boolean and optional ``error`` details.
    """
    private_key = _vapid_private_key()
    if not private_key:
        logger.warning("VAPID private key not configured; cannot send web push")
        return {"success": False, "error": "VAPID private key not configured"}

    try:
        result = webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims=_vapid_claims(),
            ttl=60 * 60,
        )
        return {"success": True, "status_code": result.status_code if result else None}
    except WebPushException as exc:
        logger.warning("Web push delivery failed: %s", exc, exc_info=False)
        return {"success": False, "error": str(exc)}
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected web push failure")
        return {"success": False, "error": str(exc)}
