"""File upload endpoints."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.api.v1.deps import CurrentAdmin
from app.core.config import get_settings

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

@router.post("/image")
async def upload_image(admin: CurrentAdmin, file: UploadFile):
    """Upload an image. Returns the URL path."""
    ext = Path(file.filename or "image.png").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed: {ext}")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 10 MB)")

    settings = get_settings()
    upload_dir = settings.upload_dir / "images"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = upload_dir / filename
    filepath.write_bytes(contents)

    url = f"/uploads/images/{filename}"
    return JSONResponse({"url": url, "filename": filename})
