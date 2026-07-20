"""allow tier: audience segments in notifications

Revision ID: a1b2c3d4e5f7
Revises: f33d496b3c87
Create Date: 2026-07-20 14:40:00.000000

Relaxes the audience_segment CHECK constraints on admin_notifications and
notification_templates to also accept dynamic per-tier segments of the form
'tier:<tier_key>' (resolved against loyalty_tiers.tier_key at send time).
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = 'f33d496b3c87'
branch_labels = None
depends_on = None

_OLD = "audience_segment IN ('all_users','new_users','loyal_customers','inactive_users','platinum_members')"
_NEW = _OLD + " OR audience_segment ~ '^tier:[A-Za-z0-9_-]{1,45}$'"


def upgrade() -> None:
    for table, constraint in (
        ("admin_notifications", "ck_admin_notifications_audience"),
        ("notification_templates", "ck_notification_templates_audience"),
    ):
        op.drop_constraint(constraint, table, type_="check")
        op.create_check_constraint(constraint, table, _NEW)


def downgrade() -> None:
    for table, constraint in (
        ("admin_notifications", "ck_admin_notifications_audience"),
        ("notification_templates", "ck_notification_templates_audience"),
    ):
        op.drop_constraint(constraint, table, type_="check")
        op.create_check_constraint(constraint, table, _OLD)
