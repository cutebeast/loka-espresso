"""Staff equipment check/report and hygiene report endpoints."""

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.routes.deps import CurrentStaff, DBDependency
from app.core.config import get_settings
from app.models.equipment import Equipment, EquipmentMaintenanceLog
from app.models.hygiene import HygieneReport
from app.schemas.base import APIResponse, BaseSchema

router = APIRouter(tags=["staff — equipment"])


# ── Staff Equipment (check & report) ──


_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _save_uploaded_images(files: list[UploadFile]) -> list[str]:
    """Save uploaded image files and return URL paths."""
    settings = get_settings()
    upload_dir = settings.upload_dir / "equipment"
    upload_dir.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in _ALLOWED_IMAGE_EXTS:
            continue
        contents = f.file.read()
        if len(contents) > 10 * 1024 * 1024:
            continue
        # Compress server-side: max 1200px edge, progressive JPEG q80
        from app.services.images import MAX_EDGE_EQUIPMENT, compress_image
        contents, ext = compress_image(contents, ext, max_edge=MAX_EDGE_EQUIPMENT)
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = upload_dir / filename
        filepath.write_bytes(contents)
        urls.append(f"/uploads/equipment/{filename}")
    return urls


class EquipmentReportRequest(BaseSchema):
    status: str = Field(..., description="Status: operational, maintenance, or broken")
    description: str = Field(..., min_length=5, max_length=500)


@router.get("/staff/equipment")
async def list_equipment_for_staff(
    db: DBDependency,
    staff: CurrentStaff,
):
    """List equipment assigned to the staff member's store."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    if not store_id:
        raise HTTPException(status_code=400, detail="No store assigned to this staff member")

    result = await db.execute(
        select(Equipment).where(
            Equipment.store_id == store_id,
            Equipment.is_active.is_(True),
        ).order_by(Equipment.name)
    )
    items = result.scalars().all()

    return APIResponse(data={
        "items": [
            {
                "id": e.id,
                "name": e.name,
                "equipment_type": e.equipment_type,
                "serial_number": e.serial_number,
                "status": e.status,
                "location": e.location,
                "last_maintenance_date": e.last_maintenance_date.isoformat() if e.last_maintenance_date else None,
                "next_maintenance_date": e.next_maintenance_date.isoformat() if e.next_maintenance_date else None,
            }
            for e in items
        ],
        "total": len(items),
    })


@router.post("/staff/equipment/{equipment_id}/report", status_code=status.HTTP_201_CREATED)
async def report_equipment_status(
    db: DBDependency,
    staff: CurrentStaff,
    equipment_id: int,
    status_field: str = Form(..., description="Status: operational, maintenance, or broken"),
    description: str = Form(..., min_length=5, max_length=500),
    images: list[UploadFile] = File(default=[]),
):
    """Staff reports equipment condition — daily check (operational) or issue (maintenance/broken)."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None

    result = await db.execute(
        select(Equipment).where(
            Equipment.id == equipment_id,
            Equipment.is_active.is_(True),
        )
    )
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if store_id and equipment.store_id != store_id:
        raise HTTPException(status_code=403, detail="Equipment does not belong to your store")

    if status_field not in ("operational", "maintenance", "broken"):
        raise HTTPException(status_code=400, detail="Status must be 'operational', 'maintenance', or 'broken'")

    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    image_urls = _save_uploaded_images(images) if images else []

    now = datetime.now(timezone.utc)

    log_type = "inspection" if status_field == "operational" else "corrective"
    log_status = "completed" if status_field == "operational" else "scheduled"

    log = EquipmentMaintenanceLog(
        equipment_id=equipment.id,
        maintenance_type=log_type,
        status=log_status,
        description=f"[Reported by {staff_name}] {description}",
        performed_by=staff_name,
        image_urls=image_urls if image_urls else None,
    )
    db.add(log)

    equipment.status = status_field
    equipment.updated_at = now

    await db.commit()
    await db.refresh(equipment)

    return APIResponse(data={
        "id": equipment.id,
        "name": equipment.name,
        "status": equipment.status,
        "maintenance_type": log_type,
        "image_urls": image_urls or [],
        "message": f"Equipment checked — {status_field}",
    })


# ── Staff Hygiene Reports (grease trap + garbage disposal) ──


@router.post("/staff/hygiene/grease-trap", status_code=status.HTTP_201_CREATED)
async def report_grease_trap(
    db: DBDependency,
    staff: CurrentStaff,
    description: str = Form("", max_length=500),
    before_images: list[UploadFile] = File(default=[]),
    after_images: list[UploadFile] = File(default=[]),
):
    """Staff reports grease trap cleaning with before and after images."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    before_urls = _save_uploaded_images(before_images) if before_images else []
    after_urls = _save_uploaded_images(after_images) if after_images else []

    report = HygieneReport(
        store_id=store_id,
        report_type="grease_trap",
        description=description or None,
        status="pending",
        image_urls={"before": before_urls, "after": after_urls},
        submitted_by=staff_name,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return APIResponse(data={
        "id": report.id,
        "report_type": report.report_type,
        "status": report.status,
        "image_urls": report.image_urls,
        "message": "Grease trap report submitted successfully",
    })


@router.post("/staff/hygiene/garbage", status_code=status.HTTP_201_CREATED)
async def report_garbage(
    db: DBDependency,
    staff: CurrentStaff,
    description: str = Form("", max_length=500),
    images: list[UploadFile] = File(default=[]),
):
    """Staff reports garbage disposal task completion with images."""
    store_id = staff.store_id if hasattr(staff, "store_id") else None
    staff_name = staff.display_name if hasattr(staff, "display_name") else f"Staff #{staff.id}"

    image_urls = _save_uploaded_images(images) if images else []

    report = HygieneReport(
        store_id=store_id,
        report_type="garbage_disposal",
        description=description or None,
        status="pending",
        image_urls=image_urls,
        submitted_by=staff_name,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return APIResponse(data={
        "id": report.id,
        "report_type": report.report_type,
        "status": report.status,
        "image_urls": report.image_urls,
        "message": "Garbage disposal report submitted successfully",
    })
