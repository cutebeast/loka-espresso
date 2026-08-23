"""transactional notifications engine

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-24

- notification_templates: event_key, is_enabled, channels, variables,
  priority, action_url_template (+ partial unique on event_key)
- notification_messages.template_id (FK SET NULL — translation merge key)
- notification_events_log (idempotency ledger for transactional sends)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notification_templates", sa.Column("event_key", sa.String(length=50), nullable=True))
    op.add_column("notification_templates", sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("notification_templates", sa.Column("channels", JSONB(), nullable=False, server_default=sa.text("'[\"in_app\", \"push_notification\"]'::jsonb")))
    op.add_column("notification_templates", sa.Column("variables", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("notification_templates", sa.Column("priority", sa.String(length=10), nullable=False, server_default=sa.text("'normal'")))
    op.add_column("notification_templates", sa.Column("action_url_template", sa.String(length=500), nullable=True))
    op.create_index(
        "uq_notification_templates_event_key",
        "notification_templates",
        ["event_key"],
        unique=True,
        postgresql_where=sa.text("event_key IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_notification_templates_priority",
        "notification_templates",
        "priority IN ('low','normal','high','urgent')",
    )

    op.add_column("notification_messages", sa.Column("template_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notification_messages_template_id",
        "notification_messages",
        "notification_templates",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "notification_events_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_key", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), nullable=False),
        sa.Column("message_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["notification_messages.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "event_key", "entity_type", "entity_id", "customer_id",
            name="uq_notification_events_once",
        ),
    )
    op.create_index("ix_notification_events_log_event_key", "notification_events_log", ["event_key"])
    op.create_index("ix_notification_events_log_customer_id", "notification_events_log", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_notification_events_log_customer_id", table_name="notification_events_log")
    op.drop_index("ix_notification_events_log_event_key", table_name="notification_events_log")
    op.drop_table("notification_events_log")
    op.drop_constraint("fk_notification_messages_template_id", "notification_messages", type_="foreignkey")
    op.drop_column("notification_messages", "template_id")
    op.drop_constraint("ck_notification_templates_priority", "notification_templates", type_="check")
    op.drop_index("uq_notification_templates_event_key", table_name="notification_templates")
    op.drop_column("notification_templates", "action_url_template")
    op.drop_column("notification_templates", "priority")
    op.drop_column("notification_templates", "variables")
    op.drop_column("notification_templates", "channels")
    op.drop_column("notification_templates", "is_enabled")
    op.drop_column("notification_templates", "event_key")
