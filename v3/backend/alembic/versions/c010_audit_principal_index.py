"""add_audit_log_principal_id_index

Revision ID: c010_audit_principal_index
Revises: c009_menu_category_index
Create Date: 2026-06-20 23:50:00.000000

"""
from alembic import op

revision = 'c010_audit_principal_index'
down_revision = 'c009_menu_category_index'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_audit_log_principal_id', 'audit_log', ['principal_id'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_audit_log_principal_id', table_name='audit_log', if_exists=True)
