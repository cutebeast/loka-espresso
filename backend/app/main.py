from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager
import os
import asyncio
from app.core.config import get_settings

settings = get_settings()

# Import the shared limiter from auth module — all @limiter.limit decorators reference this instance
from app.api.v1.endpoints.auth import limiter


async def _token_blacklist_cleanup():
    """Background task: purge expired token_blacklist rows every 24 hours."""
    from app.core.database import engine
    from sqlalchemy import text
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            async with engine.begin() as conn:
                result = await conn.execute(text("DELETE FROM token_blacklist WHERE expires_at < NOW()"))
                if result.rowcount and result.rowcount > 0:
                    print(f"[cleanup] Purged {result.rowcount} expired token_blacklist rows")
        except Exception as e:
            print(f"[cleanup] token_blacklist purge failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initial cleanup + spawn background task
    from app.core.database import engine
    from sqlalchemy import text
    async with engine.begin() as conn:
        result = await conn.execute(text("DELETE FROM token_blacklist WHERE expires_at < NOW()"))
        if result.rowcount and result.rowcount > 0:
            print(f"[startup] Cleaned {result.rowcount} expired token_blacklist rows")
    task = asyncio.create_task(_token_blacklist_cleanup())
    yield
    # Shutdown: cancel background task
    task.cancel()


app = FastAPI(
    title="FNB Super-App API",
    description="Backend API for FNB Super-App — Customer PWA + Merchant Dashboard",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware (applies after CORS)
app.add_middleware(SlowAPIMiddleware)

upload_dir = settings.UPLOAD_DIR
os.makedirs(os.path.join(upload_dir, "menu"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "splash"), exist_ok=True)
os.makedirs(os.path.join(upload_dir, "avatars"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok"}


from app.api.v1.router import api_router
app.include_router(api_router, prefix="/api/v1")
