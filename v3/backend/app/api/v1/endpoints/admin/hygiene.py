"""Admin hygiene report monitoring endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentAdmin, DBDependency
from app.models.hygiene import HygieneReport
from app.schemas.base import APIResponse, PaginatedResponse
from app.schemas.hygiene import HygieneReportOut, HygieneReportUpdate

router = APIRouter(prefix="/admin/hygiene", tags=["admin — hygiene"])


@router.get("/reports", response_model=APIResponse[PaginatedResponse[HygieneReportOut]])
async def list_hygiene_reports(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    report_type: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List all hygiene reports with filters."""
    base_stmt = select(HygieneReport).options(selectinload(HygieneReport.store))
    count_stmt = select(func.count(HygieneReport.id))

    if store_id is not None:
        base_stmt = base_stmt.where(HygieneReport.store_id == store_id)
        count_stmt = count_stmt.where(HygieneReport.store_id == store_id)
    if report_type is not None:
        base_stmt = base_stmt.where(HygieneReport.report_type == report_type)
        count_stmt = count_stmt.where(HygieneReport.report_type == report_type)
    if status is not None:
        base_stmt = base_stmt.where(HygieneReport.status == status)
        count_stmt = count_stmt.where(HygieneReport.status == status)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    result = await db.execute(
        base_stmt.order_by(HygieneReport.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = [HygieneReportOut.model_validate(r) for r in result.scalars().all()]

    return APIResponse(data=PaginatedResponse(
        items=items, total=total, page=page, per_page=per_page,
        total_pages=max(1, (total + per_page - 1) // per_page),
    ))


@router.patch("/reports/{id}", response_model=APIResponse[HygieneReportOut])
async def update_hygiene_report(
    db: DBDependency,
    admin: CurrentAdmin,
    id: int,
    data: HygieneReportUpdate,
):
    """Verify or flag a hygiene report."""
    result = await db.execute(select(HygieneReport).where(HygieneReport.id == id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if data.status is not None:
        report.status = data.status
    if data.verified_notes is not None:
        report.verified_notes = data.verified_notes
    if data.status == "verified":
        report.verified_at = datetime.now(timezone.utc)
        report.verified_by = admin.email if hasattr(admin, "email") else f"Admin #{admin.id}"

    await db.commit()
    await db.refresh(report)
    return APIResponse(data=HygieneReportOut.model_validate(report))
