"""token_version on admin_accounts, staff_profiles, customers

Revision ID: k1e2f3a4b5c6
Revises: 60077da51931
Create Date: 2026-07-30

Session revocation (round-35 H1/F5): every access/refresh token carries a
token_version claim; deps compare it against the principal row. Password/PIN
changes and refresh-token-reuse detection bump the column, killing the whole
stolen session family. server_default 0 keeps pre-existing sessions valid
(missing claim defaults to 0) until the first credential change.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'k1e2f3a4b5c6'
down_revision = '60077da51931'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_accounts",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "staff_profiles",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "customers",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("customers", "token_version")
    op.drop_column("staff_profiles", "token_version")
    op.drop_column("admin_accounts", "token_version")
