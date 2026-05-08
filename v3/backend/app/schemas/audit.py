"""Audit log domain schemas."""

from datetime import datetime
from typing import Literal

from app.schemas.base import BaseSchema


class AuditLogOut(BaseSchema):
    id: int
    principal_id: int | None = None
    action: Literal["create", "read", "update", "delete", "export", "login", "logout", "approve", "reject", "transfer", "void"]
    resource_type: str
    resource_id: int | None = None
    store_id: int | None = None
    severity: Literal["info", "notice", "warning", "critical", "emergency"] = "info"
    before_state: dict | None = None
    after_state: dict | None = None
    changes_summary: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    request_method: str | None = None
    request_path: str | None = None
    request_id: str | None = None
    session_id: str | None = None
    processing_time_ms: int | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
