"""add staff_tasks table

Revision ID: 26ef29d9bd48
Revises: cffceac8e947
Create Date: 2026-07-06 01:32:09.674982

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '26ef29d9bd48'
down_revision = 'cffceac8e947'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('staff_tasks',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('store_id', sa.Integer(), nullable=False),
    sa.Column('staff_id', sa.BigInteger(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('priority', sa.String(length=20), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_by', sa.BigInteger(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("priority IN ('low','normal','high','urgent')", name='ck_staff_tasks_priority'),
    sa.CheckConstraint("status IN ('pending','in_progress','completed','cancelled')", name='ck_staff_tasks_status'),
    sa.ForeignKeyConstraint(['completed_by'], ['staff_profiles.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['staff_id'], ['staff_profiles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_staff_tasks_staff_id'), 'staff_tasks', ['staff_id'], unique=False)
    op.create_index(op.f('ix_staff_tasks_store_id'), 'staff_tasks', ['store_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_staff_tasks_store_id'), table_name='staff_tasks')
    op.drop_index(op.f('ix_staff_tasks_staff_id'), table_name='staff_tasks')
    op.drop_table('staff_tasks')
