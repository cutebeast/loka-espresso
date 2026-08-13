"""unique type-01 e-invoice per order

Type-01 (invoice) documents are keyed per ORDER in issue_einvoice — one
invoice with the full order totals no matter how many split-bill payments
settled it. The existing uq_einvoice_order_payment_type constraint cannot
enforce this (payment_id differs per payment), so two concurrent captures
could double-issue the same codeNumber. This partial unique index backs the
app-level keying at the DB. Live DB checked clean (no duplicate type-01 rows).

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-08-13
"""
from alembic import op

revision = "x3y4z5a6b7c8"
down_revision = "w2x3y4z5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_einvoice_order_type01")
    op.execute(
        "CREATE UNIQUE INDEX uq_einvoice_order_type01 "
        "ON einvoice_documents (order_id) "
        "WHERE document_type = '01'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_einvoice_order_type01")
