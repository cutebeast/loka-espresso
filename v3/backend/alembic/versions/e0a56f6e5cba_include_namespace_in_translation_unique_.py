"""include namespace in translation unique constraint

Revision ID: e0a56f6e5cba
Revises: c6b920b58edc
Create Date: 2026-07-06 16:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e0a56f6e5cba'
down_revision = 'c6b920b58edc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Make translation uniqueness per namespace so UI namespaces can share keys."""
    # Drop the old (translation_key, locale) unique constraint.
    op.drop_constraint('uq_translations_key_locale', 'translations', type_='unique')
    # Create the new (namespace, translation_key, locale) unique constraint.
    op.create_unique_constraint(
        'uq_translations_namespace_key_locale',
        'translations',
        ['namespace', 'translation_key', 'locale'],
    )


def downgrade() -> None:
    """Restore the old (translation_key, locale) unique constraint."""
    op.drop_constraint('uq_translations_namespace_key_locale', 'translations', type_='unique')
    op.create_unique_constraint(
        'uq_translations_key_locale',
        'translations',
        ['translation_key', 'locale'],
    )
