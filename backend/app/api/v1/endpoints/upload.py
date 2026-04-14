import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import require_role
from app.core.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["Upload"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _save_upload(content: bytes, filename: str | None, folder: str, settings) -> dict:
    ext = os.path.splitext(filename or "image.jpg")[1]
    fname = f"{uuid.uuid4().hex}{ext}"
    dir_path = os.path.join(settings.UPLOAD_DIR, folder)
    os.makedirs(dir_path, exist_ok=True)
    path = os.path.join(dir_path, fname)
    with open(path, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{folder}/{fname}", "filename": fname}


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(require_role("admin")),
):
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    return _save_upload(content, file.filename, "menu", settings)


@router.post("/marketing-image")
async def upload_marketing_image(
    file: UploadFile = File(...),
    user: User = Depends(require_role("admin")),
):
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    return _save_upload(content, file.filename, "marketing", settings)
