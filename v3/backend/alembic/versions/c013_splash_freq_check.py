"""update splash screen show_frequency check

Revision ID: c013_update_splash_frequency_check
Revises: c012_inventory_stock_unique
Create Date: 2026-06-27 00:00:00.000000

"""
from alembic import op


revision = 'c013_splash_freq_check'
down_revision = 'c012_inventory_stock_unique'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('splash_screens_show_frequency_check', 'splash_screens', type_='check')
    op.create_check_constraint(
        'splash_screens_show_frequency_check',
        'splash_screens',
        "show_frequency IN ('once', 'once_per_session', 'every_open', 'once_per_day', 'always')",
    )


def downgrade():
    op.drop_constraint('splash_screens_show_frequency_check', 'splash_screens', type_='check')
    op.create_check_constraint(
        'splash_screens_show_frequency_check',
        'splash_screens',
        "show_frequency IN ('once', 'once_per_session', 'every_open', 'once_per_day')",
    )
