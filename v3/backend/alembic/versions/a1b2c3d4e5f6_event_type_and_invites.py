"""event_type_and_invites

Revision ID: a1b2c3d4e5f6
Revises: 3f36206b0cbd
Create Date: 2026-07-25 10:32:39.411651

Adds event_cards.event_type (public / invite_only / paid) and the
event_invites table (invite list gating RSVP for invite_only events).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '3f36206b0cbd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_cards",
        sa.Column("event_type", sa.String(length=20), nullable=False, server_default="public"),
    )
    op.create_table(
        "event_invites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["event_cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "customer_id", name="uq_event_invites_event_customer"),
    )
    op.create_index("ix_event_invites_event_id", "event_invites", ["event_id"])
    op.create_index("ix_event_invites_customer_id", "event_invites", ["customer_id"])
    # The 3 seeded cards promote paid workshop classes — mark them paid.
    op.execute("UPDATE event_cards SET event_type='paid' WHERE slug IN ('roastery-workshop','turkish-sand-brew-workshop','coffee-omakase-experience')")


def downgrade() -> None:
    op.drop_index("ix_event_invites_customer_id", table_name="event_invites")
    op.drop_index("ix_event_invites_event_id", table_name="event_invites")
    op.drop_table("event_invites")
    op.drop_column("event_cards", "event_type")
