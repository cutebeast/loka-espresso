"""Rate limiting configuration for FNB v3 API."""

import logging
import os

from limits import parse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Peers we trust to append a truthful X-Forwarded-For (local reverse proxies
# such as Caddy). Only when the direct peer is one of these do we key rate
# limits on the forwarded client IP.
TRUSTED_PROXY_HOSTS = {"127.0.0.1", "::1", "localhost"}


def get_client_key(request: Request) -> str:
    """Rate-limit key: first X-Forwarded-For IP when the peer is a trusted
    local proxy, otherwise the direct peer address."""
    peer = get_remote_address(request) or ""
    if peer in TRUSTED_PROXY_HOSTS:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first
    return peer


# Path-based limits for unauthenticated public mutations whose route modules
# cannot take the @limiter.limit decorator directly (owned by other teams).
# Applied by PublicMutationRateLimitMiddleware. Format: (method, path prefix, limit).
PUBLIC_MUTATION_LIMITS: tuple[tuple[str, str, str], ...] = (
    ("POST", "/api/vouchers/validate", "10/minute"),
    ("POST", "/api/payments/guest-pay/", "10/minute"),
)


class TestAwareLimiter(Limiter):
    """Limiter that disables per-route rate limits in testing/development."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        env = os.getenv("ENVIRONMENT", "development").lower()
        self._testing_mode = env in ("testing", "test", "development")
        if self._testing_mode:
            logger.info("Rate limiting disabled for environment (%s)", env)

    def limit(self, limit_value, *args, **kwargs):
        if self._testing_mode:
            # No-op decorator in testing mode
            def _noop(func):
                return func
            return _noop
        return super().limit(limit_value, *args, **kwargs)


def _build_limiter() -> Limiter:
    redis_url = os.getenv("REDIS_URL", os.getenv("RATE_LIMIT_REDIS_URL", ""))
    if not redis_url:
        redis_url = get_settings().redis_url or ""
    storage_uri = None
    if redis_url:
        storage_uri = redis_url
    else:
        logger.warning(
            "REDIS_URL not set — rate limiter using IN-MEMORY storage. "
            "In multi-worker/multi-process deployments rate limits will be per-process "
            "and effectively bypassed. Set REDIS_URL or RATE_LIMIT_REDIS_URL for production."
        )
    kwargs: dict = {"key_func": get_client_key}
    if storage_uri:
        kwargs["storage_uri"] = storage_uri
    return TestAwareLimiter(**kwargs)


limiter = _build_limiter()


def check_public_mutation_limit(request: Request) -> bool:
    """Return False when a public-mutation path rule is exceeded.

    Shares the slowapi limiter's storage/strategy and client keying so these
    paths follow the same semantics as decorator-based limits. Disabled in
    testing/development, matching TestAwareLimiter.
    """
    if getattr(limiter, "_testing_mode", False):
        return True
    path = request.url.path
    for method, prefix, limit_value in PUBLIC_MUTATION_LIMITS:
        if request.method == method and path.startswith(prefix):
            if not limiter.limiter.hit(parse(limit_value), get_client_key(request), f"path:{prefix}"):
                return False
    return True


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )
