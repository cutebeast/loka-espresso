"""Rate limiting configuration for FNB v3 API."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

# WARNING: In-memory storage won't work across multiple workers/instances.
# For multi-process deployments, configure SlowAPI with Redis:
#   from slowapi.storage.redis import RedisStorage
#   limiter = Limiter(key_func=get_remote_address, storage_uri="redis://localhost:6379/0")
limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )
