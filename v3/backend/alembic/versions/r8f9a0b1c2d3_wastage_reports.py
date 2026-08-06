"""wastage_reports — persistent audit trail for staff wastage reports

Movement-log rows only exist when stock is deducted via recipes; menu items
without recipes previously recorded nothing. This table records every report
with photo evidence and a supervisor verify/flag flow.

Revision ID: r8f9a0b1c2d3
Revises: q7e8f9a0b1c2
Create Date: 2026-08-07
"""
from alembic import op

revision = "r8f9a0b1c2d3"
down_revision = "q7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS wastage_reports (
            id BIGSERIAL PRIMARY KEY,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
            inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
            item_name VARCHAR(255) NOT NULL,
            quantity NUMERIC(10,4) NOT NULL,
            unit_of_measure VARCHAR(20),
            reason TEXT NOT NULL,
            image_urls JSONB,
            reported_by VARCHAR(120) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            verified_by VARCHAR(120),
            verified_at TIMESTAMPTZ,
            verified_notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_wastage_reports_status CHECK (status IN ('pending','verified','flagged')),
            CONSTRAINT ck_wastage_reports_item CHECK (menu_item_id IS NOT NULL OR inventory_item_id IS NOT NULL)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_wastage_reports_store_id ON wastage_reports (store_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS wastage_reports")
