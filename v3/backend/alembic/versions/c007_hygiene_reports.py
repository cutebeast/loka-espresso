"""add_hygiene_reports

Revision ID: c007_hygiene_reports
Revises: c006_pick_x_bundle
Create Date: 2026-06-19 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c007_hygiene_reports'
down_revision = 'c006_pick_x_bundle'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS hygiene_reports (
            id BIGSERIAL PRIMARY KEY,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            report_type VARCHAR(30) NOT NULL,
            description TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            image_urls JSONB DEFAULT '[]'::jsonb,
            submitted_by VARCHAR(100) NOT NULL,
            verified_by VARCHAR(100),
            verified_at TIMESTAMP WITH TIME ZONE,
            verified_notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_hygiene_reports_store_id ON hygiene_reports (store_id)"))
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE hygiene_reports ADD CONSTRAINT ck_hygiene_reports_report_type
            CHECK (report_type IN ('grease_trap','garbage_disposal'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TABLE hygiene_reports ADD CONSTRAINT ck_hygiene_reports_status
            CHECK (status IN ('pending','verified','flagged'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))


def downgrade() -> None:
    op.drop_table('hygiene_reports')
