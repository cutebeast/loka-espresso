"""Audit logging utility for recording admin actions."""
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_extras import AuditLog


def get_client_ip(request: Request | None) -> str | None:
    """Extract client IP from request, respecting X-Forwarded-For."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def log_action(
    db: AsyncSession,
    action: str,
    user_id: int | None = None,
    store_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    status: str = "success",
):
    """Record an audit log entry. Call before commit or within the same transaction."""
    entry = AuditLog(
        user_id=user_id,
        store_id=store_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
        status=status,
    )
    db.add(entry)
