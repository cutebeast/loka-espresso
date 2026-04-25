"""Add referral reward tracking columns

Revision ID: add_referral_reward_columns
Revises: marketing_pwa_v3
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_referral_reward_columns'
down_revision = 'marketing_pwa_v3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('referrals', sa.Column('referrer_reward_paid', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('referrals', sa.Column('referred_user_order_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('referral_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('referral_earnings', sa.Numeric(10, 2), nullable=False, server_default='0.00'))


def downgrade():
    op.drop_column('referrals', 'referrer_reward_paid')
    op.drop_column('referrals', 'referred_user_order_count')
    op.drop_column('users', 'referral_count')
    op.drop_column('users', 'referral_earnings')
