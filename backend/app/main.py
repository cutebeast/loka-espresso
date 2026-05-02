from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager
import os
import asyncio
import mimetypes

# Register missing MIME types
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")
import logging
from datetime import datetime

from app.core.config import get_settings
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

settings = get_settings()

# Import the shared limiter from auth module — all @limiter.limit decorators reference this instance
from app.api.v1.endpoints.common.auth import limiter

# Import new middleware
from app.core.middleware import (
    SecurityHeadersMiddleware,
    RequestSizeLimitMiddleware,
    StructuredLoggingMiddleware,
    IdempotencyMiddleware,
    RateLimitByEndpointMiddleware,
    get_logger,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("fnb_app")


async def _token_blacklist_cleanup():
    """Background task: purge expired token_blacklist rows every 24 hours."""
    from app.core.database import engine
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with engine.begin() as conn:
                result = await conn.execute(text("DELETE FROM token_blacklist WHERE expires_at < NOW()"))
                if result.rowcount and result.rowcount > 0:
                    logger.info(f"[cleanup] Purged {result.rowcount} expired token_blacklist rows")
        except Exception as e:
            logger.error(f"[cleanup] token_blacklist purge failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initial cleanup + spawn background task
    from app.core.database import engine
    logger.info("[startup] FNB Super App starting up...")
    
    # Warn about insecure defaults
    if not settings.WEBHOOK_API_KEY:
        logger.warning("[startup] WARNING: WEBHOOK_API_KEY is not set. Webhook endpoints will reject all requests.")
    
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("DELETE FROM token_blacklist WHERE expires_at < NOW()"))
            if result.rowcount and result.rowcount > 0:
                logger.info(f"[startup] Cleaned {result.rowcount} expired token_blacklist rows")
        
        # Test database connectivity
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            logger.info("[startup] Database connection successful")
            
    except Exception as e:
        logger.error(f"[startup] Database connection failed: {e}")
        raise
    
    task = asyncio.create_task(_token_blacklist_cleanup())
    logger.info("[startup] Background cleanup task started")
    
    yield
    
    # Shutdown: cancel background task
    logger.info("[shutdown] FNB Super App shutting down...")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("[shutdown] Cleanup complete")


app = FastAPI(
    title="FNB Super-App API",
    description="Backend API for FNB Super-App — Customer PWA + Merchant Dashboard",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add structured logging middleware (first to capture everything)
app.add_middleware(StructuredLoggingMiddleware)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Add request size limiting (10MB max)
app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)

# Add idempotency middleware
app.add_middleware(IdempotencyMiddleware)

# Add endpoint-specific rate limiting
app.add_middleware(RateLimitByEndpointMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin", "X-Idempotency-Key"],
)

# Rate limiting middleware from slowapi (applies after CORS)
app.add_middleware(SlowAPIMiddleware)

# Create upload directories
upload_dir = settings.UPLOAD_DIR
os.makedirs(os.path.join(upload_dir, "information"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "products"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "events"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "menu"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "marketing"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "inventory"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")


@app.get("/health", tags=["System"])
async def health():
    """Comprehensive health check endpoint."""
    from app.core.database import engine
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {}
    }

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "healthy",
            "response": "connected"
        }
    except Exception as e:
        logger.error(f"Health check - database failed: {e}")
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        raise HTTPException(status_code=503, detail=health_status)

    try:
        if os.path.exists(upload_dir) and os.access(upload_dir, os.W_OK):
            health_status["checks"]["uploads"] = {
                "status": "healthy",
                "path": upload_dir
            }
        else:
            health_status["checks"]["uploads"] = {
                "status": "unhealthy",
                "error": "Upload directory not writable"
            }
    except Exception as e:
        health_status["checks"]["uploads"] = {
            "status": "unhealthy",
            "error": str(e)
        }

    return health_status


@app.get("/ready", tags=["System"])
async def ready():
    """Kubernetes-style readiness probe."""
    from app.core.database import engine
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"ready": True}
    except Exception:
        raise HTTPException(status_code=503, detail={"ready": False})


from app.api.v1.router import api_router
app.include_router(api_router, prefix="/api/v1")
