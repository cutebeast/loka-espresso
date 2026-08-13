"""unique active referral event per (referrer, invitee) pair

Duplicate referral_events rows crashed credit_referral_points
(MultipleResultsFound on scalar_one_or_none) and let multiple referrers be
rewarded for one invitee. Live DB checked clean (0 rows) before adding this
index. Partial: an expired event may be superseded by a fresh referral.

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-08-13
"""
from alembic import op

revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_referral_events_pair_active")
    op.execute(
        "CREATE UNIQUE INDEX uq_referral_events_pair_active "
        "ON referral_events (referrer_customer_id, invitee_customer_id) "
        "WHERE status != 'expired'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_referral_events_pair_active")
