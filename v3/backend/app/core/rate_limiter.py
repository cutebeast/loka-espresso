"""Rate limiting configuration for FNB v3 API."""

import logging
import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def _build_limiter() -> Limiter:
    redis_url = os.getenv("REDIS_URL", os.getenv("RATE_LIMIT_REDIS_URL", ""))
    storage_uri = None
    if redis_url:
        storage_uri = redis_url
    else:
        logger.warning(
            "REDIS_URL not set — rate limiter using IN-MEMORY storage. "
            "In multi-worker/multi-process deployments rate limits will be per-process "
            "and effectively bypassed. Set REDIS_URL or RATE_LIMIT_REDIS_URL for production."
        )
    kwargs: dict = {"key_func": get_remote_address}
    if storage_uri:
        kwargs["storage_uri"] = storage_uri
    return Limiter(**kwargs)


limiter = _build_limiter()


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )
