"""LHDN MyInvois e-invoice documents."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EinvoiceDocument(Base, TimestampMixin):
    """One e-invoice (type 01) or refund note (type 04) for an order.

    Rows are created when a document is issued (auto on captured payment when
    `einvoice.auto_issue` is on, or manually via the admin endpoint) and track
    the MyInvois submission lifecycle:
    pending → submitted / rejected / failed → validated (or cancelled).
    """

    __tablename__ = "einvoice_documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(String(2), nullable=False, default="01")
    code_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    ubl_document: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    myinvois_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    submission_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    validation_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["Order"] = relationship("Order")
    payment: Mapped["Payment | None"] = relationship("Payment")
    store: Mapped["Store"] = relationship("Store")

    __table_args__ = (
        # Nullable payment_id keeps Postgres NULL semantics: NULLs never
        # collide, so docs without a payment are not deduplicated.
        UniqueConstraint("order_id", "payment_id", "document_type", name="uq_einvoice_order_payment_type"),
        # Type-01 invoices are per-ORDER (one invoice for the whole order no
        # matter how many split payments) — enforce the app-level keying at
        # the DB so concurrent captures cannot double-issue.
        Index(
            "uq_einvoice_order_type01",
            "order_id",
            unique=True,
            postgresql_where=text("document_type = '01'"),
        ),
    )
