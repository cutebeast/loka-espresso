"""event_audience_segment

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-25

Allows dynamic audience segments of the form "event:<event_card_id>"
(customers who RSVP'd to that event) on admin_notifications and
notification_templates, alongside the existing static segments and
"tier:<tier_key>".
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

_STATIC = "'all_users','new_users','loyal_customers','inactive_users','platinum_members'"
_NEW_CHECK = (
    f"(audience_segment::text = ANY (ARRAY[{_STATIC}]::text[]))"
    " OR (audience_segment::text ~ '^tier:[A-Za-z0-9_-]{1,45}$')"
    " OR (audience_segment::text ~ '^event:[0-9]{1,10}$')"
)
_OLD_CHECK = (
    f"(audience_segment::text = ANY (ARRAY[{_STATIC}]::text[]))"
    " OR (audience_segment::text ~ '^tier:[A-Za-z0-9_-]{1,45}$')"
)


def upgrade() -> None:
    for table, conname in (
        ("admin_notifications", "ck_admin_notifications_audience"),
        ("notification_templates", "ck_notification_templates_audience"),
    ):
        op.drop_constraint(conname, table, type_="check")
        op.create_check_constraint(conname, table, _NEW_CHECK)


def downgrade() -> None:
    for table, conname in (
        ("admin_notifications", "ck_admin_notifications_audience"),
        ("notification_templates", "ck_notification_templates_audience"),
    ):
        op.drop_constraint(conname, table, type_="check")
        op.create_check_constraint(conname, table, _OLD_CHECK)
