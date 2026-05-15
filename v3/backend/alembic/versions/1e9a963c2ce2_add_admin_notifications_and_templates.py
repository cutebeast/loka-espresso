"""add_admin_notifications_and_templates

Revision ID: 1e9a963c2ce2
Revises: ec330b37f15a
Create Date: 2026-05-10 21:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1e9a963c2ce2"
down_revision: Union[str, None] = "ec330b37f15a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("notification_type", sa.String(length=50), nullable=False, server_default="general"),
        sa.Column("audience_segment", sa.String(length=50), nullable=False, server_default="all_users"),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("action_url", sa.String(length=500), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["admin_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "notification_type IN ('general','order','reward','wallet','loyalty','promo','info','event')",
            name="ck_admin_notifications_type",
        ),
        sa.CheckConstraint(
            "audience_segment IN ('all_users','new_users','loyal_customers','inactive_users','platinum_members')",
            name="ck_admin_notifications_audience",
        ),
        sa.CheckConstraint(
            "status IN ('draft','scheduled','sent','failed')",
            name="ck_admin_notifications_status",
        ),
    )

    # Only create notification_templates if it doesn't already exist
    # (the old system may have created it already)
    op.execute("""
        CREATE TABLE IF NOT EXISTS notification_templates (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT,
            notification_type VARCHAR(50) NOT NULL DEFAULT 'general',
            audience_segment VARCHAR(50) NOT NULL DEFAULT 'all_users',
            image_url VARCHAR(500),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            CONSTRAINT ck_notification_templates_type CHECK (
                notification_type IN ('general','order','reward','wallet','loyalty','promo','info','event')
            ),
            CONSTRAINT ck_notification_templates_audience CHECK (
                audience_segment IN ('all_users','new_users','loyal_customers','inactive_users','platinum_members')
            )
        )
    """)


def downgrade() -> None:
    op.drop_table("admin_notifications")
