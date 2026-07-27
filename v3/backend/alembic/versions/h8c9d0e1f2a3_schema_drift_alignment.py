"""schema drift alignment — make alembic check clean

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
Create Date: 2026-07-27

The dev DB drifted from the model metadata (found via `alembic check`):

- event_invites.customer_id / lucky_draw_tickets.customer_id were INTEGER in
  the DB while customers.id (and the FK-inherited model types) are BigInteger
  — widen the DB columns.
- ix_event_invites_event_id is redundant (leftmost prefix of
  uq_event_invites_event_customer) — drop it. ix_event_invites_customer_id is
  a useful FK index and is now declared on the model (index=True), so it stays.
- ix_lucky_draw_tickets_campaign_id is declared on the model (index=True) but
  was never created in the DB — create it.
- payment_line_allocations.uq_payment_line_allocations_payment_line existed in
  the DB (created by g7b8c9d0e1f2) but was missing from the model — declared
  on the model in this change; no DB operation needed.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h8c9d0e1f2a3'
down_revision = 'g7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "event_invites", "customer_id",
        type_=sa.BigInteger(), existing_type=sa.Integer(), existing_nullable=False,
    )
    op.drop_index("ix_event_invites_event_id", table_name="event_invites")
    op.alter_column(
        "lucky_draw_tickets", "customer_id",
        type_=sa.BigInteger(), existing_type=sa.Integer(), existing_nullable=False,
    )
    op.create_index("ix_lucky_draw_tickets_campaign_id", "lucky_draw_tickets", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_lucky_draw_tickets_campaign_id", table_name="lucky_draw_tickets")
    op.alter_column(
        "lucky_draw_tickets", "customer_id",
        type_=sa.Integer(), existing_type=sa.BigInteger(), existing_nullable=False,
    )
    op.create_index("ix_event_invites_event_id", "event_invites", ["event_id"])
    op.alter_column(
        "event_invites", "customer_id",
        type_=sa.Integer(), existing_type=sa.BigInteger(), existing_nullable=False,
    )
