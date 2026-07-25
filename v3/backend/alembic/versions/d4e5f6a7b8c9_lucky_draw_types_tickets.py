"""lucky_draw_types_tickets

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-25

Lucky draw upgrade:
- campaigns: draw_type (free_daily/ticket_spend), spend_per_ticket_cents,
  max_segments
- new table lucky_draw_tickets (spend-earned tickets, idempotent grants)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lucky_draw_campaigns", sa.Column("draw_type", sa.String(length=20), nullable=False, server_default="free_daily"))
    op.add_column("lucky_draw_campaigns", sa.Column("spend_per_ticket_cents", sa.Integer(), nullable=False, server_default="5000"))
    op.add_column("lucky_draw_campaigns", sa.Column("max_segments", sa.Integer(), nullable=False, server_default="8"))
    op.create_check_constraint("ck_lucky_draw_campaigns_draw_type", "lucky_draw_campaigns", "draw_type IN ('free_daily','ticket_spend')")
    op.create_check_constraint("ck_lucky_draw_campaigns_spend_per_ticket", "lucky_draw_campaigns", "spend_per_ticket_cents > 0")
    op.create_check_constraint("ck_lucky_draw_campaigns_max_segments", "lucky_draw_campaigns", "max_segments BETWEEN 2 AND 12")

    op.create_table(
        "lucky_draw_tickets",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=True),
        sa.Column("order_ticket_seq", sa.Integer(), nullable=False),
        sa.Column("spin_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["campaign_id"], ["lucky_draw_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["spin_id"], ["lucky_draw_spins.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "order_id", "order_ticket_seq", name="uq_lucky_draw_tickets_campaign_order_seq"),
    )
    op.create_index("idx_lucky_draw_tickets_customer_avail", "lucky_draw_tickets", ["campaign_id", "customer_id", "consumed_at"])


def downgrade() -> None:
    op.drop_index("idx_lucky_draw_tickets_customer_avail", table_name="lucky_draw_tickets")
    op.drop_table("lucky_draw_tickets")
    op.drop_constraint("ck_lucky_draw_campaigns_max_segments", "lucky_draw_campaigns", type_="check")
    op.drop_constraint("ck_lucky_draw_campaigns_spend_per_ticket", "lucky_draw_campaigns", type_="check")
    op.drop_constraint("ck_lucky_draw_campaigns_draw_type", "lucky_draw_campaigns", type_="check")
    op.drop_column("lucky_draw_campaigns", "max_segments")
    op.drop_column("lucky_draw_campaigns", "spend_per_ticket_cents")
    op.drop_column("lucky_draw_campaigns", "draw_type")
