"""April 2026 fixes: checkout_tokens, dietary_tags, referral tracking

Revision ID: apr2026_fixes_v1
Revises: marketing_pwa_v3
Create Date: 2026-04-24 19:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'apr2026_fixes_v1'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('checkout_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('store_id', sa.Integer(), nullable=False),
        sa.Column('voucher_code', sa.String(100), nullable=True),
        sa.Column('reward_id', sa.Integer(), nullable=True),
        sa.Column('discount_type', sa.String(20), nullable=True),
        sa.Column('discount_amount', sa.DECIMAL(10, 2), nullable=True),
        sa.Column('subtotal', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('delivery_fee', sa.DECIMAL(10, 2), nullable=True, server_default='0'),
        sa.Column('total', sa.DECIMAL(10, 2), nullable=False),
        sa.Column('is_used', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_checkout_tokens_token', 'checkout_tokens', ['token'], unique=True)
    op.create_index('ix_checkout_tokens_user_id', 'checkout_tokens', ['user_id'])

    op.add_column('menu_items', sa.Column('dietary_tags', postgresql.JSON(), nullable=True))

    op.add_column('users', sa.Column('referral_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('referral_earnings', sa.DECIMAL(10, 2), nullable=False, server_default='0.00'))

    op.add_column('referrals', sa.Column('referrer_reward_paid', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('referrals', sa.Column('referred_user_order_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('referrals', 'referred_user_order_count')
    op.drop_column('referrals', 'referrer_reward_paid')
    op.drop_column('users', 'referral_earnings')
    op.drop_column('users', 'referral_count')
    op.drop_column('menu_items', 'dietary_tags')
    op.drop_index('ix_checkout_tokens_user_id')
    op.drop_index('ix_checkout_tokens_token')
    op.drop_table('checkout_tokens')
