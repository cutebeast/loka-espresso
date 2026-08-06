"""splash_screens screen_name discriminator + check constraint

Revision ID: n4b5c6d7e8f9
Revises: m3a4b5c6d7e8
Create Date: 2026-08-06

screen_name becomes a proper two-value discriminator: 'pre_login' (shown by
the PWA before login via GET /api/splash) and 'home_banner' (post-login home
banner via GET /api/home-banner). Legacy values are remapped — the pre-login
welcome screen (id 129, 'welcome-splash') becomes 'pre_login', everything
else becomes 'home_banner' — and a CHECK constraint locks the column to the
two valid values.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'n4b5c6d7e8f9'
down_revision = 'm3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Data migration: remap legacy screen_name values. The welcome splash is
    # the pre-login screen and must be remapped first, before the blanket
    # UPDATE below would otherwise send it to 'home_banner'.
    op.execute("UPDATE splash_screens SET screen_name = 'pre_login' WHERE screen_name = 'welcome-splash'")
    op.execute(
        "UPDATE splash_screens SET screen_name = 'home_banner' "
        "WHERE screen_name NOT IN ('pre_login', 'home_banner')"
    )
    op.create_check_constraint(
        "ck_splash_screens_screen_name",
        "splash_screens",
        "screen_name IN ('pre_login', 'home_banner')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_splash_screens_screen_name", "splash_screens", type_="check")
    op.execute("UPDATE splash_screens SET screen_name = 'welcome-splash' WHERE id = 129")
