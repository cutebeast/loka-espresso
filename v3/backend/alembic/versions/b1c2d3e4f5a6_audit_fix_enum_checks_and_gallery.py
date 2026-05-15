"""audit_fix_enum_checks_and_gallery

Revision ID: b1c2d3e4f5a6
Revises: a7fe1d86571d
Create Date: 2026-05-14 20:30:00.000000

Fixes from deep audit:
  - Add gallery columns to splash_screens
  - Fix marketing_campaigns status check constraint (review_pending + active)
  - Fix loyalty_points_ledger event_type check constraint (enum naming)
  - Fix payment_methods provider check constraint (full PaymentProvider enum)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a7fe1d86571d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add gallery columns to splash_screens (safe ADD IF NOT EXISTS)
    op.execute("""
        ALTER TABLE splash_screens
        ADD COLUMN IF NOT EXISTS image_gallery_urls JSONB,
        ADD COLUMN IF NOT EXISTS gallery_video_url VARCHAR(500)
    """)

    # 2. Fix marketing_campaigns status — add new enum values BEFORE migration
    #    ALTER TYPE must run outside a transaction in PostgreSQL
    op.execute("COMMIT")
    op.execute("ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'review_pending'")
    op.execute("ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'active'")
    op.execute("ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'running'")
    op.execute("UPDATE marketing_campaigns SET status = 'active' WHERE status = 'running'")
    op.execute("ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS ck_marketing_campaigns_status")
    op.execute("""
        ALTER TABLE marketing_campaigns
        ADD CONSTRAINT ck_marketing_campaigns_status
        CHECK (status IN ('draft','review_pending','scheduled','active','paused','completed','cancelled'))
    """)

    # 3. Fix loyalty_points_ledger event_type check constraint
    #    Old: earn_purchase,earn_bonus,earn_referral,...
    #    New: order_earned,referral_bonus,birthday_bonus,... (matches LoyaltyEventType enum)
    op.execute("ALTER TABLE loyalty_points_ledger DROP CONSTRAINT IF EXISTS ck_loyalty_points_ledger_event_type")
    op.execute("""
        ALTER TABLE loyalty_points_ledger
        ADD CONSTRAINT ck_loyalty_points_ledger_event_type
        CHECK (event_type IN (
            'order_earned','referral_bonus','birthday_bonus','welcome_bonus',
            'tier_bonus','promo_bonus','social_share','review_submitted',
            'manual_adjustment','reward_redemption','voucher_conversion',
            'points_expired','return_deduction','account_merge'
        ))
    """)

    # 4. Fix payment_methods provider check constraint (add missing enum values)
    op.execute("ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS ck_payment_methods_provider")
    op.execute("""
        ALTER TABLE payment_methods
        ADD CONSTRAINT ck_payment_methods_provider
        CHECK (provider IN (
            'stripe','adyen','braintree','paypal','cash','store_credit',
            'internal_wallet','grabpay','gcash','alipay','wechat_pay'
        ))
    """)


def downgrade() -> None:
    # 1. Drop gallery columns from splash_screens
    op.execute("ALTER TABLE splash_screens DROP COLUMN IF EXISTS gallery_video_url")
    op.execute("ALTER TABLE splash_screens DROP COLUMN IF EXISTS image_gallery_urls")

    # 2. Revert marketing_campaigns status check
    op.execute("UPDATE marketing_campaigns SET status = 'running' WHERE status = 'active'")
    op.execute("ALTER TABLE marketing_campaigns DROP CONSTRAINT IF EXISTS ck_marketing_campaigns_status")
    op.execute("""
        ALTER TABLE marketing_campaigns
        ADD CONSTRAINT ck_marketing_campaigns_status
        CHECK (status IN ('draft','scheduled','running','paused','completed','cancelled'))
    """)

    # 3. Revert loyalty_points_ledger event_type check
    op.execute("ALTER TABLE loyalty_points_ledger DROP CONSTRAINT IF EXISTS ck_loyalty_points_ledger_event_type")
    op.execute("""
        ALTER TABLE loyalty_points_ledger
        ADD CONSTRAINT ck_loyalty_points_ledger_event_type
        CHECK (event_type IN (
            'earn_purchase','earn_bonus','earn_referral','redeem_reward',
            'redeem_discount','adjust_manual','expire_points',
            'tier_upgrade','tier_downgrade','welcome_bonus'
        ))
    """)

    # 4. Revert payment_methods provider check
    op.execute("ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS ck_payment_methods_provider")
    op.execute("""
        ALTER TABLE payment_methods
        ADD CONSTRAINT ck_payment_methods_provider
        CHECK (provider IN (
            'stripe','adyen','braintree','paypal','cash','store_credit','internal_wallet'
        ))
    """)
