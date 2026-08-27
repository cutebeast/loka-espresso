"""print_jobs table + print config keys

Receipt-printing + cash-drawer integration (Star CloudPRNT server-pull).
The print_jobs queue is provider-agnostic: store printers poll our backend
over outbound HTTPS and pull queued documents, so Epson Server Direct Print
can reuse the same table later. Seeds the print.* platform_config keys
(mirrors the eghl config-gating pattern in f3a4b5c6d7e8).

Revision ID: b6c7d8e9f0a1
Revises: b7c8d9e0f1a2
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b6c7d8e9f0a1'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "print_jobs",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("store_id", sa.Integer(), nullable=False),
        sa.Column("printer_token", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="queued"),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=100),
            nullable=False,
            server_default="text/vnd.star.markup",
        ),
        sa.Column("order_id", sa.BigInteger(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["store_id"], ["stores.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "type IN ('receipt','drawer_kick','kitchen_ticket')",
            name="ck_print_jobs_type",
        ),
        sa.CheckConstraint(
            "status IN ('queued','printed','failed')",
            name="ck_print_jobs_status",
        ),
    )
    op.create_index("idx_print_jobs_token_status", "print_jobs", ["printer_token", "status"])
    op.create_index("ix_print_jobs_store_id", "print_jobs", ["store_id"])
    op.create_index("ix_print_jobs_order_id", "print_jobs", ["order_id"])

    # Seed editable print config keys (both default on; admin can disable
    # per platform without a redeploy).
    keys = [
        ("print.auto_receipt", "true", "boolean"),
        ("print.drawer_on_cash", "true", "boolean"),
    ]
    for key, value, value_type in keys:
        op.execute(
            sa.text(
                """
                INSERT INTO platform_config (
                    config_key,
                    config_value,
                    value_type,
                    environment,
                    is_sensitive,
                    is_editable
                )
                VALUES (
                    :key,
                    CAST(:value AS jsonb),
                    :value_type,
                    'all',
                    false,
                    true
                )
                ON CONFLICT DO NOTHING
                """
            ).bindparams(key=key, value=value, value_type=value_type)
        )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM platform_config
            WHERE config_key IN ('print.auto_receipt', 'print.drawer_on_cash')
            """
        )
    )
    op.drop_index("ix_print_jobs_order_id", table_name="print_jobs")
    op.drop_index("ix_print_jobs_store_id", table_name="print_jobs")
    op.drop_index("idx_print_jobs_token_status", table_name="print_jobs")
    op.drop_table("print_jobs")
