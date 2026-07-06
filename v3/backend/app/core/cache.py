"""Shared Redis client for backend caches."""

import logging

from redis.asyncio import Redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Redis | None = None


def get_redis_client() -> Redis | None:
    """Return a shared async Redis client, or None if Redis is unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    settings = get_settings()
    if not settings.redis_url:
        logger.warning("REDIS_URL not configured")
        return None
    try:
        _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        return _redis_client
    except Exception as exc:
        logger.error("Failed to create Redis client: %s", exc)
        return None


redis_client = get_redis_client()
