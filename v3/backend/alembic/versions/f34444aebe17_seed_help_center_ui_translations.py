"""seed help center ui translations

Revision ID: f34444aebe17
Revises: 8057c17735e6
Create Date: 2026-07-09 16:48:18.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f34444aebe17'
down_revision = '8057c17735e6'
branch_labels = None
depends_on = None


_HELP_ADMIN_UI_KEYS = [
    ("admin.nav.helpCenter", "Help Center"),
    ("help.help_center", "Help Center"),
    ("help.manage_articles", "Manage help articles"),
    ("help.preview", "Preview"),
    ("help.add_article", "Add Article"),
    ("help.new_article", "New Article"),
    ("help.edit_article", "Edit Article"),
    ("help.title", "Title"),
    ("help.slug", "Slug"),
    ("help.slug_placeholder", "article-url-slug"),
    ("help.audience", "Audience"),
    ("help.category", "Category"),
    ("help.category_placeholder", "e.g. Getting Started"),
    ("help.position", "Position"),
    ("help.body", "Body"),
    ("help.body_placeholder", "Write article content in Markdown or HTML..."),
    ("help.is_active", "Active"),
    ("help.status", "Status"),
    ("help.actions", "Actions"),
    ("help.last_updated", "Last updated"),
    ("help.uncategorized", "Uncategorized"),
    ("help.save_failed", "Failed to save article."),
]

_HELP_STAFF_UI_KEYS = [
    ("header.help", "Help"),
    ("dashboard.help", "Help articles and guides"),
    ("help.help_center", "Help Center"),
    ("help.no_articles", "No help articles available."),
    ("help.not_found", "Article not found."),
    ("help.load_failed", "Failed to load help articles."),
    ("help.load_article_failed", "Failed to load article"),
    ("help.uncategorized", "Uncategorized"),
    ("help.last_updated", "Last updated"),
]


def upgrade() -> None:
    admin_values = ",\n            ".join(
        f"('admin-ui', '{key}', 'en', '{text.replace(chr(39), chr(39)+chr(39))}', '{text.replace(chr(39), chr(39)+chr(39))}', false)"
        for key, text in _HELP_ADMIN_UI_KEYS
    )
    staff_values = ",\n            ".join(
        f"('staff-ui', '{key}', 'en', '{text.replace(chr(39), chr(39)+chr(39))}', '{text.replace(chr(39), chr(39)+chr(39))}', false)"
        for key, text in _HELP_STAFF_UI_KEYS
    )

    op.execute(f"""
        INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
        VALUES
            {admin_values}
        ON CONFLICT (namespace, translation_key, locale) DO UPDATE SET
            translated_text = EXCLUDED.translated_text,
            source_text = EXCLUDED.source_text,
            is_auto_translated = false;
    """)

    op.execute(f"""
        INSERT INTO translations (namespace, translation_key, locale, translated_text, source_text, is_auto_translated)
        VALUES
            {staff_values}
        ON CONFLICT (namespace, translation_key, locale) DO UPDATE SET
            translated_text = EXCLUDED.translated_text,
            source_text = EXCLUDED.source_text,
            is_auto_translated = false;
    """)


def downgrade() -> None:
    all_keys = [k for k, _ in _HELP_ADMIN_UI_KEYS] + [k for k, _ in _HELP_STAFF_UI_KEYS]
    placeholders = ", ".join(f"'{k}'" for k in all_keys)
    op.execute(f"DELETE FROM translations WHERE translation_key IN ({placeholders});")
