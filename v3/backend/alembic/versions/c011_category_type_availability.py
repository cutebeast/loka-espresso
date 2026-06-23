"""add_category_type_and_time_date_availability

Revision ID: c011_category_availability
Revises: c010_audit_principal_index
Create Date: 2026-06-23 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c011_category_availability'
down_revision = 'd6077079b249'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('menu_categories', sa.Column('category_type', sa.String(20), nullable=False, server_default='regular'))
    op.add_column('menu_categories', sa.Column('available_from_time', sa.Time(), nullable=True))
    op.add_column('menu_categories', sa.Column('available_to_time', sa.Time(), nullable=True))
    op.add_column('menu_categories', sa.Column('available_from_date', sa.Date(), nullable=True))
    op.add_column('menu_categories', sa.Column('available_to_date', sa.Date(), nullable=True))

    op.create_check_constraint('ck_menu_categories_category_type', 'menu_categories', "category_type IN ('regular','combo')")
    op.create_check_constraint('ck_menu_categories_time_window', 'menu_categories',
        "(available_from_time IS NULL) OR (available_to_time IS NULL) OR (available_from_time < available_to_time)")
    op.create_check_constraint('ck_menu_categories_date_window', 'menu_categories',
        "(available_from_date IS NULL) OR (available_to_date IS NULL) OR (available_from_date <= available_to_date)")

    # Mark existing Combo category (slug=bundle_combo) as category_type='combo'
    op.execute("UPDATE menu_categories SET category_type = 'combo' WHERE slug = 'bundle_combo'")


def downgrade() -> None:
    op.drop_constraint('ck_menu_categories_date_window', 'menu_categories', type_='check')
    op.drop_constraint('ck_menu_categories_time_window', 'menu_categories', type_='check')
    op.drop_constraint('ck_menu_categories_category_type', 'menu_categories', type_='check')
    op.drop_column('menu_categories', 'available_to_date')
    op.drop_column('menu_categories', 'available_from_date')
    op.drop_column('menu_categories', 'available_to_time')
    op.drop_column('menu_categories', 'available_from_time')
    op.drop_column('menu_categories', 'category_type')
