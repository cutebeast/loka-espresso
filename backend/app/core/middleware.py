"""
Security and utility middleware for FNB Super App.
Includes: security headers, request size limiting, idempotency keys, structured logging.
"""
import time
import uuid
import json
import hashlib
import logging
from typing import Optional, Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("fnb_app")


# Redis helper for distributed rate limiting and caching
def _get_redis_client():
    """Get Redis client if REDIS_URL is configured, else None."""
    try:
        from app.core.config import get_settings
        settings = get_settings()
        if not settings.REDIS_URL:
            return None
        import redis
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # XSS Protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # HSTS (HTTPS only)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https:;"
        )
        
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions Policy
        response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=(self)"
        
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limit request body size to prevent memory exhaustion."""
    
    def __init__(self, app: ASGIApp, max_size: int = 10 * 1024 * 1024):  # 10MB default
        super().__init__(app)
        self.max_size = max_size
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method in ["POST", "PUT", "PATCH"]:
            # Fast-path: reject oversized requests via Content-Length header before reading body
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > self.max_size:
                        logger.warning(f"Request too large (Content-Length): {content_length} bytes from {request.client.host}")
                        return JSONResponse(
                            status_code=413,
                            content={"detail": f"Request body too large. Max size: {self.max_size / 1024 / 1024}MB"}
                        )
                except (ValueError, TypeError):
                    pass  # Malformed header; fall through to body check
            
            body = await request.body()
            if len(body) > self.max_size:
                logger.warning(f"Request too large: {len(body)} bytes from {request.client.host}")
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request body too large. Max size: {self.max_size / 1024 / 1024}MB"}
                )
            # Re-build request with body for downstream
            async def receive():
                return {"type": "http.request", "body": body}
            request._receive = receive
        
        return await call_next(request)


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """Add structured logging with correlation IDs."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or extract correlation ID
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())[:8])
        request.state.correlation_id = correlation_id
        
        # Start timer
        start_time = time.time()
        
        # Log request
        logger.info(json.dumps({
            "event": "request_start",
            "correlation_id": correlation_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent", "unknown")[:100]
        }))
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Log response
            logger.info(json.dumps({
                "event": "request_complete",
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2)
            }))
            
            # Add correlation ID to response
            response.headers["X-Correlation-ID"] = correlation_id
            
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(json.dumps({
                "event": "request_error",
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "error": str(e),
                "duration_ms": round(duration * 1000, 2)
            }))
            raise


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """
    Idempotency key middleware for POST/PUT/PATCH requests.
    Uses Redis when available, falls back to in-memory dict.
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._cache_ttl = 300  # 5 minutes
        self._redis = _get_redis_client()
        self._cache = {}  # Fallback in-memory cache
        if self._redis:
            logger.info("IdempotencyMiddleware using Redis backend")
        else:
            logger.info("IdempotencyMiddleware using in-memory fallback")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in ["POST", "PUT", "PATCH"]:
            return await call_next(request)

        body = await request.body()

        async def receive() -> dict:
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = receive
        
        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            return await call_next(request)

        body_hash = hashlib.sha256(body).hexdigest()
        
        # Scope cache key by user identity (Authorization header or session cookie)
        user_token = request.headers.get("Authorization") or request.cookies.get("session") or "anonymous"
        token_hash = hashlib.sha256(user_token.encode()).hexdigest()[:12]
        
        cache_key = f"idempotency:{request.method}:{request.url.path}:{idempotency_key}:{body_hash}:{token_hash}"
        
        # Check Redis first, then fallback to in-memory
        if self._redis:
            cached = self._redis.get(cache_key)
            if cached:
                try:
                    data = json.loads(cached)
                    logger.info(f"Idempotency Redis cache hit: {cache_key}")
                    return Response(
                        content=data["content"].encode(),
                        status_code=data["status_code"],
                        headers={"X-Idempotency-Replay": "true"}
                    )
                except Exception:
                    pass  # Corrupted cache entry, fall through
        else:
            # In-memory fallback: clean expired entries
            now = time.time()
            self._cache = {
                k: v for k, v in self._cache.items()
                if v["expires_at"] > now
            }
            
            if cache_key in self._cache:
                cached = self._cache[cache_key]
                logger.info(f"Idempotency memory cache hit: {cache_key}")
                return Response(
                    content=cached["content"],
                    status_code=cached["status_code"],
                    headers={"X-Idempotency-Replay": "true"}
                )
        
        # Process request
        response = await call_next(request)
        
        # Cache successful responses
        if response.status_code < 500:
            resp_body = b""
            async for chunk in response.body_iterator:
                resp_body += chunk
            
            if self._redis:
                try:
                    self._redis.setex(
                        cache_key,
                        self._cache_ttl,
                        json.dumps({
                            "content": resp_body.decode(),
                            "status_code": response.status_code,
                        })
                    )
                except Exception as e:
                    logger.warning(f"Redis idempotency cache write failed: {e}")
            else:
                self._cache[cache_key] = {
                    "content": resp_body,
                    "status_code": response.status_code,
                    "expires_at": time.time() + self._cache_ttl
                }
            
            return Response(
                content=resp_body,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
        
        return response


class RateLimitByEndpointMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting for specific high-risk endpoints.
    Uses Redis when available, falls back to in-memory storage.
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._limits = {
            "POST:/api/v1/orders": (10, 60),
            "POST:/api/v1/wallet/topup": (5, 60),
            "POST:/api/v1/loyalty": (20, 60),
            "POST:/api/v1/rewards": (10, 60),
            "POST:/api/v1/feedback": (5, 60),
            "POST:/api/v1/cart/items": (30, 60),
        }
        self._redis = _get_redis_client()
        self._requests = {}  # Fallback in-memory storage
        if self._redis:
            logger.info("RateLimitByEndpointMiddleware using Redis backend")
        else:
            logger.info("RateLimitByEndpointMiddleware using in-memory fallback")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        key = f"{request.method}:{request.url.path}"
        
        if key not in self._limits:
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        limit_key = f"ratelimit:{client_ip}:{key}"
        limit, window = self._limits[key]
        
        now = time.time()
        
        if self._redis:
            try:
                # Use Redis sorted set: score = timestamp, member = nanoid
                # Remove entries older than window
                self._redis.zremrangebyscore(limit_key, 0, now - window)
                current = self._redis.zcard(limit_key)
                
                if current >= limit:
                    logger.warning(f"Rate limit exceeded: {limit_key}")
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "Rate limit exceeded",
                            "limit": limit,
                            "window_seconds": window
                        }
                    )
                
                # Record request with timestamp as score
                self._redis.zadd(limit_key, {str(uuid.uuid4()): now})
                self._redis.expire(limit_key, window)
            except Exception as e:
                logger.warning(f"Redis rate limit check failed: {e}")
        else:
            # In-memory fallback
            if limit_key in self._requests:
                self._requests[limit_key] = [
                    (ts, cnt) for ts, cnt in self._requests[limit_key]
                    if now - ts < window
                ]
            else:
                self._requests[limit_key] = []
            
            total = sum(cnt for ts, cnt in self._requests[limit_key])
            
            if total >= limit:
                logger.warning(f"Rate limit exceeded: {limit_key}")
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded",
                        "limit": limit,
                        "window_seconds": window
                    }
                )
            
            self._requests[limit_key].append((now, 1))
        
        return await call_next(request)


def get_logger(request: Optional[Request] = None) -> logging.Logger:
    """Get logger with correlation ID if available."""
    if request and hasattr(request.state, "correlation_id"):
        return logging.getLogger(f"fnb_app.{request.state.correlation_id}")
    return logger
