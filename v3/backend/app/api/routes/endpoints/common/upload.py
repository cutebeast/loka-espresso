"""File upload endpoints."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.api.routes.deps import CurrentAdmin
from app.core.config import get_settings

router = APIRouter(prefix="/upload", tags=["upload"])

# SVG is intentionally not allowed: it can carry active content (script,
# event handlers) and content-scanning is not reliable enough to serve it
# from our own origin.
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".webm", ".mkv"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

_CONTENT_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
}

_MAGIC_BYTES: dict[str, bytes] = {
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".png": b"\x89PNG\r\n\x1a\n",
    ".gif": b"GIF8",
    ".webp": b"RIFF",
    ".mp4": b"\x00\x00\x00\x18ftyp",
    ".webm": b"\x1a\x45\xdf\xa3",
    ".mkv": b"\x1a\x45\xdf\xa3",
}

# Container formats whose reliable signature is not at offset 0:
# .mov (ISO-BMFF/QuickTime) has a variable-length box size before the "ftyp"
# brand at offset 4; .avi is a RIFF container identified by the "AVI " form
# type at offset 8.
_OFFSET_SIGNATURES: dict[str, tuple[int, bytes]] = {
    ".mov": (4, b"ftyp"),
    ".avi": (8, b"AVI "),
}


def _validate_file_content(contents: bytes, ext: str) -> bool:
    """Validate file magic bytes match the extension."""
    if ext in _OFFSET_SIGNATURES:
        offset, sig = _OFFSET_SIGNATURES[ext]
        return contents[offset:offset + len(sig)] == sig
    if ext not in _MAGIC_BYTES:
        # Every extension in ALLOWED_EXTENSIONS is mapped above; an unmapped
        # extension reaches here only if the allowlist grows without a
        # signature — allowed, but add a mapping when extending it.
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

    # Compress server-side: resize to max 1600px edge + progressive JPEG q80
    # (opaque) / optimized PNG (transparency). Uploads arrive full-size
    # otherwise — multi-MB banners were noticeably slowing the portals.
    from app.services.images import compress_image
    contents, ext = compress_image(contents, ext)

    upload_dir = settings.upload_dir / "images"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = upload_dir / filename
    filepath.write_bytes(contents)

    url = f"/uploads/images/{filename}"
    return JSONResponse({"url": url, "filename": filename})
