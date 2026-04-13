"""Audit logging utility for recording admin actions."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.admin_extras import AuditLog


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
