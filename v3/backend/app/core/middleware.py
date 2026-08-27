"""Custom ASGI middleware."""

import time
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.rate_limiter import check_public_mutation_limit

logger = structlog.get_logger()


class PublicMutationRateLimitMiddleware(BaseHTTPMiddleware):
    """Applies path-based rate limits (PUBLIC_MUTATION_LIMITS) to public
    mutation endpoints whose route modules don't carry @limiter.limit."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method == "POST" and not check_public_mutation_limit(request):
            return Response(
                content='{"detail":"Rate limit exceeded. Please try again later."}',
                status_code=429,
                media_type="application/json",
            )
        return await call_next(request)


class RequestBodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized request bodies via their declared Content-Length.

    Webhook and public JSON endpoints buffer request.body() unbounded — a
    declared-size cap stops trivial memory-exhaustion attempts before the
    body is read. JSON-ish /api/* bodies are capped at 1 MB; multipart
    uploads (image endpoints, staff equipment photos) get 10 MB, matching
    the per-file cap in the upload handlers.
    """

    JSON_LIMIT = 1 * 1024 * 1024
    MULTIPART_LIMIT = 10 * 1024 * 1024

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path.startswith("/api/"):
            content_length = request.headers.get("content-length")
            transfer_encoding = request.headers.get("transfer-encoding", "")
            if content_length is None and transfer_encoding:
                # Chunked/unknown-length bodies bypass the declared-size cap
                # while handlers buffer them unbounded — reject. Requests with
                # neither header carry no body (empty-body DELETEs/POSTs are
                # legitimate) and pass through.
                return Response(
                    content='{"detail":"Content-Length header required"}',
                    status_code=411,
                    media_type="application/json",
                )
            if content_length:
                try:
                    declared = int(content_length)
                except ValueError:
                    return Response(
                        content='{"detail":"Invalid Content-Length"}',
                        status_code=400,
                        media_type="application/json",
                    )
                is_multipart = (request.headers.get("content-type") or "").startswith("multipart/")
                limit = self.MULTIPART_LIMIT if is_multipart else self.JSON_LIMIT
                if declared > limit:
                    return Response(
                        content='{"detail":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
        )
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
        # The dev/staging checkout simulator completes with a 303 back to the
        # customer app — a different origin in dev (PWA :13810 vs API :13800 or
        # a prod-domain simulator against a local PWA). Chrome enforces
        # form-action across the submission's redirect chain, so 'self'
        # strands the customer on the simulator page. Exempt just these paths.
        if request.url.path.startswith("/api/wallet/topup/simulator"):
            csp = csp.replace("form-action 'self';", "form-action *;")
        response.headers["Content-Security-Policy"] = csp
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # Unhandled exceptions bubble to ServerErrorMiddleware (bare 500)
            # without ever producing a response object — log them here or
            # 5xxs are invisible in the request log.
            duration = (time.perf_counter() - start) * 1000
            logger.info(
                "request",
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=round(duration, 2),
            )
            raise
        duration = (time.perf_counter() - start) * 1000
        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration, 2),
        )
        return response
