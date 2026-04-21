"""Audit logging utility for recording admin actions."""
import json
from datetime import datetime, date
from decimal import Decimal
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


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


def _sanitize_details(obj):
    """Recursively convert non-JSON-serializable types to strings."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_details(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_details(v) for v in obj]
    return str(obj)


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
    safe_details = _sanitize_details(details)
    # Verify it serializes cleanly
    json.dumps(safe_details)
    entry = AuditLog(
        user_id=user_id,
        store_id=store_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=safe_details,
        ip_address=ip_address,
        status=status,
    )
    db.add(entry)
