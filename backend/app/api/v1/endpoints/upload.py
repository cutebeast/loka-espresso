import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.core.security import get_current_user
from app.core.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only images allowed")
    ext = os.path.splitext(file.filename or "image.jpg")[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, "menu", filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/menu/{filename}", "filename": filename}
