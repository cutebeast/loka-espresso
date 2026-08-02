"""FNB Enterprise v3 — FastAPI application entrypoint."""
import logging
import re
from decimal import Decimal
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

from app.api.routes.router import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.middleware import (
    PublicMutationRateLimitMiddleware,
    RequestBodySizeLimitMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler

settings = get_settings()


class DecimalEncoder:
    @staticmethod
    def default(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


class DecimalSafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        import json
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=DecimalEncoder.default,
        ).encode("utf-8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="Enterprise F&B platform API",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
    default_response_class=DecimalSafeJSONResponse,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Last-resort guard: turn DB constraint violations into clean 4xx.

    Without this, an unhandled unique/FK/NOT NULL/CHECK violation surfaces as
    a bare 500 (the allergen/survey duplicate-key bug class). Endpoints that
    handle IntegrityError themselves are unaffected — this only fires for
    uncaught ones.
    """
    orig = getattr(exc, "orig", None)
    raw = str(orig or exc)
    raw_l = raw.lower()
    constraint = (re.search(r'constraint "([^"]+)"', raw) or [None, ""])[1]

    # asyncpg's concrete class (UniqueViolationError etc.) only survives in the
    # string form after SQLAlchemy's dialect wrapping — match on the text.
    if "uniqueviolation" in raw_l or "duplicate key" in raw_l:
        status_code, friendly = 409, "A record with this value already exists"
    elif "foreignkeyviolation" in raw_l or "violates foreign key" in raw_l:
        status_code, friendly = 409, "This record is linked to other data, or references a record that does not exist"
    elif "notnullviolation" in raw_l or "not-null constraint" in raw_l or "null value in column" in raw_l:
        status_code, friendly = 400, "A required field is missing"
    elif "checkviolation" in raw_l or "check constraint" in raw_l:
        status_code, friendly = 400, "A value is outside its allowed range"
    else:
        status_code, friendly = 400, "The change violates a database constraint"

    logger.warning(
        "IntegrityError on %s %s: %s",
        request.method, request.url.path, constraint or raw[:200],
    )
    detail = f"{friendly}." + (f" (constraint: {constraint})" if constraint else "")
    return JSONResponse(status_code=status_code, content={"detail": detail})

# Security middleware
# Note: Starlette runs middlewares in reverse registration order — the public
# mutation rate limiter must be registered FIRST so its 429 responses still
# pass through CORS and security headers on the way out.
app.add_middleware(PublicMutationRateLimitMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.get_allowed_hosts())
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)
app.add_middleware(RequestLoggingMiddleware)

# Static files for uploads (directory creation moved to lifespan startup)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# API routes
app.include_router(api_router, prefix="/api")


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "version": "3.0.0", "environment": settings.environment}
