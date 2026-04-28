import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import require_role, get_current_user
from app.core.config import get_settings
from app.models.admin_user import AdminUser
from app.models.user import RoleIDs

router = APIRouter(prefix="/upload", tags=["Upload"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_DOC_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_DOC_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     "application/vnd.ms-excel", "text/csv"}

MAGIC_BYTES = {
    "image/jpeg": [(b"\xff\xd8\xff",)],
    "image/png": [(b"\x89PNG\r\n\x1a\n",)],
    "image/gif": [(b"GIF87a",), (b"GIF89a",)],
    "image/webp": [(b"RIFF", b"WEBP")],
    "application/pdf": [(b"%PDF",)],
}


def _validate_magic_bytes(content: bytes, expected_mime: str) -> bool:
    signatures = MAGIC_BYTES.get(expected_mime, [])
    for sig_tuple in signatures:
        if all(content.find(sig) != -1 for sig in sig_tuple):
            return True
    return False


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
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    if not _validate_magic_bytes(content, file.content_type):
        raise HTTPException(status_code=400, detail="File content does not match declared image type")
    return _save_upload(content, file.filename, "menu", settings)


@router.post("/marketing-image")
async def upload_marketing_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    if not _validate_magic_bytes(content, file.content_type):
        raise HTTPException(status_code=400, detail="File content does not match declared image type")
    return _save_upload(content, file.filename, "marketing", settings)


@router.post("/information-image")
async def upload_information_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload an image for information cards / product gallery."""
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF images allowed")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    if not _validate_magic_bytes(content, file.content_type):
        raise HTTPException(status_code=400, detail="File content does not match declared image type")
    return _save_upload(content, file.filename, "information", settings)


@router.post("/document")
async def upload_document(
    file: UploadFile = File(...),
    user: AdminUser = Depends(get_current_user),
):
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail="File type not allowed. Accepted: images, PDF, Excel, CSV")
    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_DOC_SIZE // (1024*1024)}MB")
    if file.content_type in MAGIC_BYTES and not _validate_magic_bytes(content, file.content_type):
        raise HTTPException(status_code=400, detail="File content does not match declared type")
    return _save_upload(content, file.filename, "inventory", settings)
