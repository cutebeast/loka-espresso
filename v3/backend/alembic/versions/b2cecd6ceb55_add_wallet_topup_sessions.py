"""add wallet topup sessions

Revision ID: b2cecd6ceb55
Revises: c0c059660bb4
Create Date: 2026-07-02 17:02:24.139429

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2cecd6ceb55'
down_revision = 'c0c059660bb4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'wallet_topup_sessions',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('customer_id', sa.BigInteger(), nullable=False),
        sa.Column('amount', sa.Numeric(12, 4), nullable=False),
        sa.Column('currency_code', sa.CHAR(3), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('provider_session_id', sa.String(255), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_wallet_topup_sessions_customer_id', 'wallet_topup_sessions', ['customer_id'])
    op.create_index('idx_wallet_topup_sessions_provider_session_id', 'wallet_topup_sessions', ['provider_session_id'])


def downgrade() -> None:
    op.drop_index('idx_wallet_topup_sessions_provider_session_id', table_name='wallet_topup_sessions')
    op.drop_index('idx_wallet_topup_sessions_customer_id', table_name='wallet_topup_sessions')
    op.drop_table('wallet_topup_sessions')
