"""einvoice_documents (LHDN MyInvois)

Revision ID: i9c0d1e2f3a4
Revises: h8c9d0e1f2a3
Create Date: 2026-07-27

One row per e-invoice / refund note issued for an order, tracking the
MyInvois submission lifecycle (pending → submitted/rejected/failed →
validated). The (order_id, payment_id, document_type) unique key makes
issuance idempotent; nullable payment_id keeps Postgres NULL semantics so
rows without a payment never collide.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'i9c0d1e2f3a4'
down_revision = 'h8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "einvoice_documents",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "order_id",
            sa.BigInteger(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payment_id",
            sa.BigInteger(),
            sa.ForeignKey("payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "store_id",
            sa.Integer(),
            sa.ForeignKey("stores.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_type", sa.String(2), nullable=False),
        sa.Column("code_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("ubl_document", postgresql.JSONB(), nullable=True),
        sa.Column("myinvois_uuid", sa.String(64), nullable=True),
        sa.Column("submission_uid", sa.String(64), nullable=True),
        sa.Column("validation_link", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("order_id", "payment_id", "document_type", name="uq_einvoice_order_payment_type"),
    )
    op.create_index("ix_einvoice_documents_order_id", "einvoice_documents", ["order_id"])
    op.create_index("ix_einvoice_documents_payment_id", "einvoice_documents", ["payment_id"])
    op.create_index("ix_einvoice_documents_store_id", "einvoice_documents", ["store_id"])


def downgrade() -> None:
    op.drop_index("ix_einvoice_documents_store_id", table_name="einvoice_documents")
    op.drop_index("ix_einvoice_documents_payment_id", table_name="einvoice_documents")
    op.drop_index("ix_einvoice_documents_order_id", table_name="einvoice_documents")
    op.drop_table("einvoice_documents")
