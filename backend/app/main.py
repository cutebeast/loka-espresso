from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="FNB Super-App API",
    description="Backend API for FNB Super-App — Customer PWA + Merchant Dashboard",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
