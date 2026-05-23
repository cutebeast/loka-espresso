"""Rate limiting configuration for FNB v3 API."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


def _build_limiter() -> Limiter:
    redis_url = os.getenv("REDIS_URL", os.getenv("RATE_LIMIT_REDIS_URL", ""))
    storage_uri = None
    if redis_url:
        storage_uri = redis_url
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
