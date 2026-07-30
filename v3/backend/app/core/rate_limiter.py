"""Rate limiting configuration for FNB v3 API."""

import ipaddress
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

# Cloudflare edge ranges (https://www.cloudflare.com/ips — fetched 2026-07-29).
# CF-Connecting-IP is only trusted when Caddy's direct peer (the last XFF
# entry) is inside these ranges — otherwise a direct-to-origin caller could
# spoof the header to dodge per-client limits.
_CF_NETWORKS = tuple(
    ipaddress.ip_network(c)
    for c in (
        "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
        "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
        "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
        "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
        "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
        "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
    )
)


def _is_cloudflare_peer(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in _CF_NETWORKS)


def _ip_key(ip: str) -> str:
    """Key IPv6 clients on their /64 prefix.

    IPv6 privacy extensions rotate the interface identifier per connection,
    so per-address keying both lets clients evade limits and shards one
    client across buckets. The /64 prefix is stable per client network.
    """
    if ":" in ip:
        return ":".join(ip.split(":")[:4]) + "::/64"
    return ip


def get_client_key(request: Request) -> str:
    """Rate-limit key: the real client IP behind our proxy chain.

    Order of trust when the direct peer is a local proxy (Caddy):
    1. CF-Connecting-IP — set by Cloudflare on every proxied request and
       overwritten when client-supplied, but only trusted when Caddy's own
       peer (the last XFF entry it appended) is a Cloudflare edge address;
       this stops direct-to-origin callers spoofing the header.
    2. LAST X-Forwarded-For entry — appended by our own Caddy (the peer that
       talked to it). The FIRST entry is client-controllable (Cloudflare
       appends to a spoofed header rather than replacing it), so trusting
       the leftmost entry makes every per-IP limit trivially bypassable.
    Direct (non-proxied) traffic keys on the TCP peer itself.
    """
    peer = get_remote_address(request) or ""
    if peer in TRUSTED_PROXY_HOSTS:
        xff = request.headers.get("x-forwarded-for")
        last_hop = xff.split(",")[-1].strip() if xff else ""
        cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
        if cf_ip and last_hop and _is_cloudflare_peer(last_hop):
            return _ip_key(cf_ip)
        if last_hop:
            return _ip_key(last_hop)
    return _ip_key(peer)


# Path-based limits for unauthenticated public mutations whose route modules
# cannot take the @limiter.limit decorator directly (owned by other teams).
# Applied by PublicMutationRateLimitMiddleware. Format: (method, path prefix, limit).
PUBLIC_MUTATION_LIMITS: tuple[tuple[str, str, str], ...] = (
    ("POST", "/api/vouchers/validate", "10/minute"),
    ("POST", "/api/payments/guest-pay/", "10/minute"),
)


def _is_local_direct_call(request: Request) -> bool:
    """Exempt local, non-proxied calls from rate limits.

    Only a process on this host can make a loopback connection WITHOUT an
    X-Forwarded-For header (Caddy always adds one), so this bucket covers
    exactly the E2E suite, cron scripts and local tooling — remote callers
    (direct-to-origin or via Caddy) always carry XFF or a non-loopback peer
    and stay limited.
    """
    peer = get_remote_address(request) or ""
    return peer in TRUSTED_PROXY_HOSTS and not request.headers.get("x-forwarded-for")


class TestAwareLimiter(Limiter):
    """Limiter that disables per-route rate limits in testing/development."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Env var wins (tests/CI); otherwise use the app settings (.env) so
        # the limiter agrees with the rest of the app about the environment.
        # Previously os.getenv only — the pm2 process env has no ENVIRONMENT,
        # so this silently stayed in testing mode and disabled all limits.
        env = (os.getenv("ENVIRONMENT") or get_settings().environment).lower()
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

    def _check_request_limit(self, request, endpoint_func, in_middleware=True):
        # Central choke point for decorator- and middleware-based limits:
        # skip entirely in testing mode and for local non-proxied calls.
        # view_rate_limit must be set — the decorator wrapper reads it for
        # response headers (None = no headers injected).
        if self._testing_mode or _is_local_direct_call(request):
            request.state.view_rate_limit = None
            return
        return super()._check_request_limit(request, endpoint_func, in_middleware)


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
    if _is_local_direct_call(request):
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
