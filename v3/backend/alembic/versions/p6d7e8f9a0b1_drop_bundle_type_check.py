"""drop hardcoded bundle_type CHECK — admin-defined types validated at API layer

Revision ID: p6d7e8f9a0b1
Revises: o5c6d7e8f9a0
Create Date: 2026-08-04
"""
from alembic import op

revision = "p6d7e8f9a0b1"
down_revision = "o5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_bundle_products_bundle_type", "bundle_products", type_="check")


def downgrade() -> None:
    op.create_check_constraint(
        "ck_bundle_products_bundle_type",
        "bundle_products",
        "bundle_type = ANY (ARRAY['combo','value_meal','family_meal','breakfast_set','promotional','pick_x','multi_course'])",
    )
