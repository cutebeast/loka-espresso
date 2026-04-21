"""Add payment, delivery, and OTP hardening columns

Revision ID: f2a1c3b4d5e6
Revises: e1f0a1b2c3d4
Create Date: 2026-04-21 07:15:00.000000
"""

from datetime import timedelta
import uuid

from alembic import op
import sqlalchemy as sa


revision = "f2a1c3b4d5e6"
down_revision = "e1f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("otp_sessions", sa.Column("session_token", sa.String(length=64), nullable=True))
    op.add_column("otp_sessions", sa.Column("send_count", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("otp_sessions", sa.Column("verify_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("otp_sessions", sa.Column("resend_available_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("otp_sessions", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("otp_sessions", sa.Column("provider", sa.String(length=30), nullable=True))
    op.add_column("otp_sessions", sa.Column("delivery_status", sa.String(length=30), nullable=True))
    op.add_column("otp_sessions", sa.Column("failure_reason", sa.Text(), nullable=True))

    op.add_column("payments", sa.Column("provider", sa.String(length=50), nullable=True))
    op.add_column("payments", sa.Column("provider_reference", sa.String(length=255), nullable=True))
    op.add_column("payments", sa.Column("idempotency_key", sa.String(length=255), nullable=True))
    op.add_column("payments", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("orders", sa.Column("delivery_status", sa.String(length=50), nullable=True))
    op.add_column("orders", sa.Column("delivery_external_id", sa.String(length=255), nullable=True))
    op.add_column("orders", sa.Column("delivery_quote_id", sa.String(length=255), nullable=True))
    op.add_column("orders", sa.Column("delivery_tracking_url", sa.String(length=500), nullable=True))
    op.add_column("orders", sa.Column("delivery_eta_minutes", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("delivery_courier_name", sa.String(length=255), nullable=True))
    op.add_column("orders", sa.Column("delivery_courier_phone", sa.String(length=50), nullable=True))
    op.add_column("orders", sa.Column("delivery_last_event_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    otp_sessions = sa.table(
        "otp_sessions",
        sa.column("id", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    rows = bind.execute(sa.select(otp_sessions.c.id, otp_sessions.c.created_at)).fetchall()
    for row in rows:
        created_at = row.created_at
        resend_available_at = created_at + timedelta(seconds=60) if created_at else None
        bind.execute(
            sa.text(
                """
                UPDATE otp_sessions
                SET session_token = :session_token,
                    resend_available_at = :resend_available_at,
                    provider = COALESCE(provider, 'stub'),
                    delivery_status = COALESCE(delivery_status, 'queued')
                WHERE id = :id
                """
            ),
            {
                "id": row.id,
                "session_token": uuid.uuid4().hex,
                "resend_available_at": resend_available_at,
            },
        )

    bind.execute(sa.text("UPDATE payments SET provider = COALESCE(provider, 'internal') WHERE provider IS NULL"))
    bind.execute(sa.text("UPDATE orders SET delivery_status = 'awaiting_dispatch' WHERE order_type = 'delivery' AND delivery_status IS NULL"))

    op.alter_column("otp_sessions", "session_token", nullable=False)
    op.create_index("ix_otp_sessions_session_token", "otp_sessions", ["session_token"], unique=True)
    op.create_index("ix_payments_provider_reference", "payments", ["provider_reference"], unique=False)
    op.create_index("ix_orders_delivery_external_id", "orders", ["delivery_external_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_orders_delivery_external_id", table_name="orders")
    op.drop_index("ix_payments_provider_reference", table_name="payments")
    op.drop_index("ix_otp_sessions_session_token", table_name="otp_sessions")

    op.drop_column("orders", "delivery_last_event_at")
    op.drop_column("orders", "delivery_courier_phone")
    op.drop_column("orders", "delivery_courier_name")
    op.drop_column("orders", "delivery_eta_minutes")
    op.drop_column("orders", "delivery_tracking_url")
    op.drop_column("orders", "delivery_quote_id")
    op.drop_column("orders", "delivery_external_id")
    op.drop_column("orders", "delivery_status")

    op.drop_column("payments", "settled_at")
    op.drop_column("payments", "failure_reason")
    op.drop_column("payments", "idempotency_key")
    op.drop_column("payments", "provider_reference")
    op.drop_column("payments", "provider")

    op.drop_column("otp_sessions", "failure_reason")
    op.drop_column("otp_sessions", "delivery_status")
    op.drop_column("otp_sessions", "provider")
    op.drop_column("otp_sessions", "verified_at")
    op.drop_column("otp_sessions", "resend_available_at")
    op.drop_column("otp_sessions", "verify_attempts")
    op.drop_column("otp_sessions", "send_count")
    op.drop_column("otp_sessions", "session_token")
