"""Platform & Governance models."""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import AuditAction, AuditSeverity


class PlatformConfig(Base):
    __tablename__ = "platform_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config_key: Mapped[str] = mapped_column(String(100), nullable=False)
    config_value: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    value_type: Mapped[str] = mapped_column(String(20), nullable=False, default="string")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    modified_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    editor: Mapped["AdminAccount"] = relationship("AdminAccount")

    __table_args__ = (
        UniqueConstraint("config_key", "environment"),
        CheckConstraint(
            "value_type IN ('string','integer','decimal','boolean','json','timestamp')",
            name="ck_platform_config_value_type",
        ),
        CheckConstraint(
            "environment IN ('all','development','staging','production')",
            name="ck_platform_config_environment",
        ),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    principal_id: Mapped[int | None] = mapped_column(
        ForeignKey("iam_principals.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(AuditAction, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    severity: Mapped[str] = mapped_column(AuditSeverity, nullable=False, default="info")
    before_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    changes_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    request_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "action IN ('create','read','update','delete','export','login','logout','approve','reject','transfer','void')",
            name="ck_audit_log_action",
        ),
        CheckConstraint(
            "severity IN ('info','notice','warning','critical','emergency')",
            name="ck_audit_log_severity",
        ),
    )


class ScheduledJob(Base, TimestampMixin):
    __tablename__ = "scheduled_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    job_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    cron_expression: Mapped[str | None] = mapped_column(String(100), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_run_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint(
            "job_type IN ('cleanup','report','notification','sync','billing','data_retention')",
            name="ck_scheduled_jobs_job_type",
        ),
        CheckConstraint(
            "last_run_status IN ('success','failed','running','skipped')",
            name="ck_scheduled_jobs_last_run_status",
        ),
        CheckConstraint("run_count >= 0", name="ck_scheduled_jobs_run_count"),
        CheckConstraint("failure_count >= 0", name="ck_scheduled_jobs_failure_count"),
    )


class DataRetentionPolicy(Base):
    __tablename__ = "data_retention_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    purge_strategy: Mapped[str] = mapped_column(String(20), nullable=False, default="anonymize")
    archive_table: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    records_purged_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    last_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint("retention_days > 0", name="ck_data_retention_policies_retention_days"),
        CheckConstraint(
            "purge_strategy IN ('delete','anonymize','archive')",
            name="ck_data_retention_policies_purge_strategy",
        ),
        CheckConstraint(
            "records_purged_count >= 0",
            name="ck_data_retention_policies_records_purged_count",
        ),
    )


class SystemHealthMetric(Base):
    __tablename__ = "system_health_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    metric_name: Mapped[str] = mapped_column(String(50), nullable=False)
    store_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="SET NULL"), nullable=True
    )
    metric_value: Mapped[float] = mapped_column(Numeric(15, 6), nullable=False)
    metric_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dimensions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    bucket_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "bucket_duration_minutes IN (1, 5, 15, 60, 1440)",
            name="ck_system_health_metrics_bucket_duration_minutes",
        ),
    )
