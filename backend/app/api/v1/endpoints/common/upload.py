import os
import uuid
import mimetypes
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from app.core.security import require_role, get_current_user
from app.core.config import get_settings
from app.models.admin_user import AdminUser
from app.models.customer import Customer
from app.models.user import RoleIDs

router = APIRouter(prefix="/upload", tags=["Upload"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_DOC_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_WIDTH = 1200  # px
MAX_IMAGE_HEIGHT = 1200  # px
JPEG_QUALITY = 85
ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_DOC_TYPES = {"image/jpeg", "image/png", "application/pdf",
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     "application/vnd.ms-excel", "text/csv"}

MAGIC_BYTES = {
    "image/jpeg": [(b"\xff\xd8\xff",)],
    "image/png": [(b"\x89PNG\r\n\x1a\n",)],
    "application/pdf": [(b"%PDF",)],
}


def _validate_magic_bytes(content: bytes, expected_mime: str) -> bool:
    signatures = MAGIC_BYTES.get(expected_mime, [])
    for sig_tuple in signatures:
        if all(content.find(sig) != -1 for sig in sig_tuple):
            return True
    return False


async def _process_image(content: bytes, filename: str) -> bytes:
    """Resize, strip EXIF, convert to JPEG. Returns processed JPEG bytes."""
    from PIL import Image

    img = Image.open(BytesIO(content))

    # Convert RGBA/P to RGB (white background)
    if img.mode in ('RGBA', 'P'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'RGBA':
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Resize if too large (maintain aspect ratio)
    w, h = img.size
    if w > MAX_IMAGE_WIDTH or h > MAX_IMAGE_HEIGHT:
        ratio = min(MAX_IMAGE_WIDTH / w, MAX_IMAGE_HEIGHT / h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    # Save as optimized JPEG (strips EXIF metadata)
    out = BytesIO()
    img.save(out, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def _save_upload(content: bytes, filename: str | None, folder: str, settings) -> dict:
    ext = os.path.splitext(filename or "image.jpg")[1].lower()
    # Force .jpg for all image uploads
    if ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
        ext = '.jpg'
    fname = f"{uuid.uuid4().hex}{ext}"
    dir_path = os.path.join(settings.UPLOAD_DIR, folder)
    os.makedirs(dir_path, exist_ok=True)
    path = os.path.join(dir_path, fname)
    with open(path, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{folder}/{fname}", "filename": fname}


async def _upload_validated(file: UploadFile, folder: str) -> dict:
    """Validate, process (resize/optimize), and save uploaded image."""
    settings = get_settings()
    if not file.content_type or file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG images accepted")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    # Process: resize, optimize, convert to JPEG
    try:
        content = await _process_image(content, file.filename or "image.jpg")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")

    return _save_upload(content, file.filename, folder, settings)


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload menu item image."""
    return await _upload_validated(file, "menu")


@router.post("/information-image")
async def upload_information_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload information card image."""
    return await _upload_validated(file, "information")


@router.post("/products-image")
async def upload_products_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload product card image."""
    return await _upload_validated(file, "products")


@router.post("/events-image")
async def upload_events_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload event popup image (full-screen)."""
    return await _upload_validated(file, "events")


@router.post("/reward-image")
async def upload_reward_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload reward image."""
    return await _upload_validated(file, "rewards")


@router.post("/banner-image")
async def upload_banner_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload promo banner image."""
    return await _upload_validated(file, "promos")


@router.post("/store-image")
async def upload_store_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Upload store image."""
    return await _upload_validated(file, "stores")


@router.post("/marketing-image")
async def upload_marketing_image(
    file: UploadFile = File(...),
    user: AdminUser = Depends(require_role(RoleIDs.ADMIN)),
):
    """Legacy: upload store image."""
    return await _upload_validated(file, "stores")


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


# ---------------------------------------------------------------------------
# Authenticated file serving endpoint (replaces public StaticFiles)
# ---------------------------------------------------------------------------

@router.get("/files/{path:path}")
async def serve_upload(
    path: str,
    user: AdminUser | Customer = Depends(get_current_user),
):
    """
    Serve uploaded files with authentication.
    Replaces the public `/uploads` StaticFiles mount.
    Any authenticated user (admin or customer) can access files.
    """
    settings = get_settings()
    base_dir = os.path.abspath(settings.UPLOAD_DIR)

    # Prevent path traversal attacks
    requested_path = os.path.abspath(os.path.join(base_dir, path))
    if not requested_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(requested_path) or not os.path.isfile(requested_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Guess MIME type from file extension
    mime_type, _ = mimetypes.guess_type(requested_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    return FileResponse(
        path=requested_path,
        media_type=mime_type,
        filename=os.path.basename(requested_path),
    )
