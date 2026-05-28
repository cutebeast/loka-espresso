"""clean_voucher_types_add_minimum_tier_id

Revision ID: a95e99792003
Revises: f7g8h9i0j1k2
Create Date: 2026-05-28 06:36:41.779383

"""
from alembic import op
import sqlalchemy as sa


revision = 'a95e99792003'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old CHECK constraint (7 types) and create new one (4 types)
    op.execute(
        "ALTER TABLE voucher_definitions DROP CONSTRAINT IF EXISTS ck_voucher_definitions_voucher_type"
    )
    op.create_check_constraint(
        "ck_voucher_definitions_voucher_type",
        "voucher_definitions",
        "voucher_type IN ('percentage_off','fixed_amount_off','free_delivery','free_item')",
    )

    # Add minimum_tier_id column with FK to loyalty_tiers
    op.add_column(
        "voucher_definitions",
        sa.Column(
            "minimum_tier_id",
            sa.Integer(),
            sa.ForeignKey("loyalty_tiers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        op.f("ix_voucher_definitions_minimum_tier_id"),
        "voucher_definitions",
        ["minimum_tier_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_voucher_definitions_minimum_tier_id"),
        table_name="voucher_definitions",
    )
    op.drop_constraint(
        "ck_voucher_definitions_voucher_type",
        "voucher_definitions",
        type_="check",
    )
    op.drop_column("voucher_definitions", "minimum_tier_id")
    op.create_check_constraint(
        "ck_voucher_definitions_voucher_type",
        "voucher_definitions",
        "voucher_type IN ('percentage_off','fixed_amount_off','free_delivery','free_item','bundle_offer','referral_reward','loyalty_exclusive')",
    )
