"""order_modification_logs.line_item_id FK ON DELETE SET NULL (drift guard)

pg 'n' = SET NULL — the live constraint already had the right semantics;
the remove-line-item 409 came from the endpoint inserting the log AFTER
deleting the line (referencing a dead row), not from the constraint. This
migration recreates the constraint explicitly so fresh provisions and the
model agree (model declares ondelete="SET NULL").

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-08-15
"""
from alembic import op

revision = "y4z5a6b7c8d9"
down_revision = "x3y4z5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE order_modification_logs "
        "DROP CONSTRAINT IF EXISTS order_modification_logs_line_item_id_fkey"
    )
    op.execute(
        "ALTER TABLE order_modification_logs "
        "ADD CONSTRAINT order_modification_logs_line_item_id_fkey "
        "FOREIGN KEY (line_item_id) REFERENCES order_line_items(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE order_modification_logs "
        "DROP CONSTRAINT IF EXISTS order_modification_logs_line_item_id_fkey"
    )
    op.execute(
        "ALTER TABLE order_modification_logs "
        "ADD CONSTRAINT order_modification_logs_line_item_id_fkey "
        "FOREIGN KEY (line_item_id) REFERENCES order_line_items(id)"
    )
