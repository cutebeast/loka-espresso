"""Receipt / kitchen printing job queue models.

Server-pull printing (Star CloudPRNT first transport; Epson Server Direct
Print later): store printers poll our backend over outbound HTTPS and pull
queued jobs, so the queue is provider-agnostic — a job is just a document
body + content type addressed to a per-printer token.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PrintJob(Base):
    __tablename__ = "print_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Per-printer pairing token (print.printers entry in store_configuration) —
    # the printer presents it on every CloudPRNT poll. Not a FK: the registry
    # is JSON, so the token is duplicated here for direct queue lookups.
    printer_token: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # queued -> printed | failed. A job stays 'queued' while in flight (the
    # printer re-GETs until it DELETEs); failed ACKs bump attempts and only
    # settle as 'failed' once the requeue cap is hit.
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="queued")
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(100), nullable=False, default="text/vnd.star.markup"
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Number of failed delivery attempts (printer ACKed with an error code).
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    printed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "type IN ('receipt','drawer_kick','kitchen_ticket')",
            name="ck_print_jobs_type",
        ),
        CheckConstraint(
            "status IN ('queued','printed','failed')",
            name="ck_print_jobs_status",
        ),
        Index("idx_print_jobs_token_status", "printer_token", "status"),
    )
