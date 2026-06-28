"""File upload endpoints."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.api.routes.deps import CurrentAdmin
from app.core.config import get_settings

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mov", ".avi", ".webm", ".mkv"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

_CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
}

_MAGIC_BYTES: dict[str, bytes] = {
    ".jpg": b"\xff\xd8\xff",
    ".png": b"\x89PNG\r\n\x1a\n",
    ".gif": b"GIF8",
    ".webp": b"RIFF",
    ".mp4": b"\x00\x00\x00\x18ftyp",
    ".webm": b"\x1a\x45\xdf\xa3",
}


def _validate_file_content(contents: bytes, ext: str) -> bool:
    """Validate file magic bytes match the extension."""
    if ext not in _MAGIC_BYTES:
        return True
    magic = _MAGIC_BYTES[ext]
    return contents[:len(magic)] == magic


@router.post("/image")
async def upload_image(admin: CurrentAdmin, file: UploadFile):
    """Upload an image. Returns the URL path."""
    ext = Path(file.filename or "image.png").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed: {ext}")

    settings = get_settings()
    max_size = settings.max_upload_size_bytes

    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(400, f"File too large (max {settings.max_upload_size_mb} MB)")

    if file.content_type:
        expected_mime = _CONTENT_TYPE_MAP.get(ext)
        if expected_mime and file.content_type != expected_mime:
            raise HTTPException(400, f"Content-Type mismatch: {file.content_type} does not match extension {ext}")

    if not _validate_file_content(contents, ext):
        raise HTTPException(400, f"File content does not match extension {ext}")

    if ext == ".svg":
        text = contents.decode("utf-8", errors="ignore")[:1024].lower()
        if "<script" in text or "javascript:" in text or "onload=" in text:
            raise HTTPException(400, "SVG contains disallowed content")

    upload_dir = settings.upload_dir / "images"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = upload_dir / filename
    filepath.write_bytes(contents)

    url = f"/uploads/images/{filename}"
    return JSONResponse({"url": url, "filename": filename})
