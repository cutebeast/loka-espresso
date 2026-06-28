"""Admin audit log endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.routes.deps import CurrentAdmin, DBDependency
from app.models.platform import AuditLog
from app.schemas.audit import AuditLogOut
from app.schemas.base import APIResponse, PaginatedResponse

router = APIRouter(prefix="/admin/audit-log", tags=["admin — audit log"])


@router.get("", response_model=APIResponse[PaginatedResponse[AuditLogOut]])
async def list_audit_logs(
    db: DBDependency,
    admin: CurrentAdmin,
    store_id: int | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    severity: str | None = Query(None),
    principal_id: int | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
):
    """List audit logs with filters."""
    base_stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))

    if store_id is not None:
        base_stmt = base_stmt.where(AuditLog.store_id == store_id)
        count_stmt = count_stmt.where(AuditLog.store_id == store_id)
    if action is not None:
        base_stmt = base_stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if resource_type is not None:
        base_stmt = base_stmt.where(AuditLog.resource_type == resource_type)
        count_stmt = count_stmt.where(AuditLog.resource_type == resource_type)
    if severity is not None:
        base_stmt = base_stmt.where(AuditLog.severity == severity)
        count_stmt = count_stmt.where(AuditLog.severity == severity)
    if principal_id is not None:
        base_stmt = base_stmt.where(AuditLog.principal_id == principal_id)
        count_stmt = count_stmt.where(AuditLog.principal_id == principal_id)
    if date_from is not None:
        base_stmt = base_stmt.where(AuditLog.created_at >= date_from)
        count_stmt = count_stmt.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        base_stmt = base_stmt.where(AuditLog.created_at <= date_to)
        count_stmt = count_stmt.where(AuditLog.created_at <= date_to)

    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = base_stmt.order_by(AuditLog.id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = []
    for r in result.scalars().all():
        d = {c: getattr(r, c) for c in r.__table__.columns.keys()}
        d["ip_address"] = str(d["ip_address"]) if d.get("ip_address") else None
        items.append(AuditLogOut.model_validate(d))

    return APIResponse(
        data=PaginatedResponse(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=(total + per_page - 1) // per_page,
        )
    )


@router.get("/{log_id}", response_model=APIResponse[AuditLogOut])
async def get_audit_log(
    db: DBDependency,
    admin: CurrentAdmin,
    log_id: int,
):
    """Get a single audit log detail."""
    result = await db.execute(select(AuditLog).where(AuditLog.id == log_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log not found")
    return APIResponse(data=AuditLogOut.model_validate(log))
