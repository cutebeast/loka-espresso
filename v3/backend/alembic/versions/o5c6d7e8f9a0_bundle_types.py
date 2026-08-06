"""bundle_types table: admin-editable bundle types mapped to mechanics

Revision ID: o5c6d7e8f9a0
Revises: n4b5c6d7e8f9
Create Date: 2026-08-06

bundle_products.bundle_type was a free-form string the engine branched on
directly ('multi_course', 'pick_x', everything else = fixed combo). This
introduces a bundle_types table so admins can invent their own type keys;
each key maps to one of the three engine mechanics. Seeds the built-in
mechanics plus the legacy combo-family labels that already exist in
bundle_products data and the DB CHECK constraint.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'o5c6d7e8f9a0'
down_revision = 'n4b5c6d7e8f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bundle_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type_key", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("mechanic", sa.String(length=20), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("type_key"),
        sa.CheckConstraint(
            "mechanic IN ('combo','pick_x','multi_course')",
            name="ck_bundle_types_mechanic",
        ),
    )

    op.execute(
        "INSERT INTO bundle_types (type_key, name, description, mechanic, display_order, is_active, created_at, updated_at) VALUES "
        "('combo', 'Fixed Set', 'All items included at a set price. No choices.', 'combo', 0, true, now(), now()), "
        "('pick_x', 'Pick & Choose', 'Customer picks N items from a single pool.', 'pick_x', 1, true, now(), now()), "
        "('multi_course', 'Multi-Course', 'Multiple groups, each with its own pick count.', 'multi_course', 2, true, now(), now()), "
        "('value_meal', 'Value Meal', NULL, 'combo', 3, true, now(), now()), "
        "('family_meal', 'Family Meal', NULL, 'combo', 4, true, now(), now()), "
        "('breakfast_set', 'Breakfast Set', NULL, 'combo', 5, true, now(), now()), "
        "('promotional', 'Promotional', NULL, 'combo', 6, true, now(), now())"
    )


def downgrade() -> None:
    op.drop_table("bundle_types")
