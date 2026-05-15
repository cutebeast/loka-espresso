"""add_event_rsvps_table

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-05-15 01:40:00.000000

Adds event_rsvps table for customer RSVP tracking.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS event_rsvps (
            id SERIAL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES event_cards(id) ON DELETE CASCADE,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_event_rsvps_event_customer
        ON event_rsvps (event_id, customer_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS event_rsvps")
