"""add_missing_marketing_columns

Revision ID: a4b5c6d7e8f9
Revises: f3d2b1a4c5e6
Create Date: 2026-05-10 22:15:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f3d2b1a4c5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reward columns
    op.add_column("reward_catalog", sa.Column("how_to_redeem", sa.Text(), nullable=True))
    op.add_column("reward_catalog", sa.Column("long_description", sa.Text(), nullable=True))

    # Voucher columns
    op.add_column("voucher_definitions", sa.Column("how_to_redeem", sa.Text(), nullable=True))
    op.add_column("voucher_definitions", sa.Column("short_description", sa.String(length=255), nullable=True))
    op.add_column("voucher_definitions", sa.Column("long_description", sa.Text(), nullable=True))
    op.add_column("voucher_definitions", sa.Column("promo_type", sa.String(length=50), nullable=True))
    op.add_column("voucher_definitions", sa.Column("validity_days", sa.Integer(), nullable=True))

    # Survey column
    op.add_column("survey_definitions", sa.Column("reward_voucher_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_survey_definitions_reward_voucher",
        "survey_definitions", "voucher_definitions",
        ["reward_voucher_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_survey_definitions_reward_voucher_id", "survey_definitions", ["reward_voucher_id"])


def downgrade() -> None:
    op.drop_index("ix_survey_definitions_reward_voucher_id", table_name="survey_definitions")
    op.drop_constraint("fk_survey_definitions_reward_voucher", "survey_definitions", type_="foreignkey")
    op.drop_column("survey_definitions", "reward_voucher_id")
    op.drop_column("voucher_definitions", "validity_days")
    op.drop_column("voucher_definitions", "promo_type")
    op.drop_column("voucher_definitions", "long_description")
    op.drop_column("voucher_definitions", "short_description")
    op.drop_column("voucher_definitions", "how_to_redeem")
    op.drop_column("reward_catalog", "long_description")
    op.drop_column("reward_catalog", "how_to_redeem")
