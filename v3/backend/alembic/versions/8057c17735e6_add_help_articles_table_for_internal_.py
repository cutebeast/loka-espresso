"""add help_articles table for internal wiki

Revision ID: 8057c17735e6
Revises: 18bb306973d9
Create Date: 2026-07-09 16:48:17.340410

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8057c17735e6'
down_revision = '18bb306973d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('help_articles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=100), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('audience', sa.String(length=20), nullable=False),
    sa.Column('category', sa.String(length=50), nullable=True),
    sa.Column('body_text', sa.Text(), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )


def downgrade() -> None:
    op.drop_table('help_articles')
