"""Webhook helpers: idempotency and provider secret resolution."""

import hashlib
import json
import logging
from datetime import timedelta

from app.core.cache import get_redis_client
from app.core.config import get_settings
from app.services.platform_config import PlatformConfigService

logger = logging.getLogger(__name__)


def _get_redis():
    return get_redis_client()


def _event_cache_key(provider: str, event_id: str) -> str:
    return f"webhook:event:{provider}:{hashlib.sha256(event_id.encode()).hexdigest()}"


async def is_event_processed(provider: str, event_id: str) -> bool:
    """Return True if this provider/event_id has already been processed."""
    if not event_id:
        return False
    try:
        r = _get_redis()
        if r is None:
            return False
        return await r.exists(_event_cache_key(provider, event_id)) == 1
    except Exception as exc:
        logger.warning("Webhook idempotency check failed for %s:%s: %s", provider, event_id, exc)
        return False


async def mark_event_processed(provider: str, event_id: str, ttl_seconds: int = 86400) -> None:
    """Mark a webhook event as processed in Redis."""
    if not event_id:
        return
    try:
        r = _get_redis()
        if r is None:
            return
        await r.setex(_event_cache_key(provider, event_id), timedelta(seconds=ttl_seconds), "1")
    except Exception as exc:
        logger.warning("Webhook idempotency mark failed for %s:%s: %s", provider, event_id, exc)


async def get_provider_secret(
    db,
    provider: str,
    env_attr: str,
    platform_config_key: str,
) -> str | None:
    """Resolve a provider-specific webhook secret.

    Order of precedence:
      1. platform_config (runtime, can be rotated without redeploy)
      2. environment variable (fallback)
      3. generic webhook_signing_secret (legacy fallback for GrabPay)
    """
    config_service = PlatformConfigService(db)
    secret = await config_service.get_str(platform_config_key, default="")
    if secret:
        return secret

    settings = get_settings()
    secret = getattr(settings, env_attr, None)
    if secret:
        return secret

    # Legacy generic fallback (GrabPay only)
    if provider == "grabpay":
        return settings.webhook_signing_secret or None

    return None


def extract_event_id(provider: str, payload: dict) -> str | None:
    """Extract a stable event idempotency key from a webhook payload."""
    if provider == "stripe":
        return str(payload.get("id", "")) or None
    if provider == "hitpay":
        # HitPay payload wraps payment requests
        obj = payload.get("payment_request") or payload.get("object") or payload
        if isinstance(obj, dict):
            return str(obj.get("id", "")) or None
        return None
    if provider == "grabpay":
        obj = payload.get("data") or payload
        if isinstance(obj, dict):
            txn = obj.get("transaction") or obj
            if isinstance(txn, dict):
                return str(txn.get("id", "")) or str(txn.get("transaction_id", "")) or None
        return None
    return None


def mask_header(value: str | None, keep: int = 8) -> str:
    if not value:
        return "<empty>"
    if len(value) <= keep * 2:
        return value
    return f"{value[:keep]}...{value[-keep:]}"
