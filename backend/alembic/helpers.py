"""Alembic migration helpers for idempotent operations."""
from alembic import op
from sqlalchemy import text


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the current database."""
    conn = op.get_bind()
    result = conn.execute(
        text("SELECT to_regclass(:name)"),
        {"name": table_name},
    )
    return result.scalar() is not None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists on a table."""
    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column_name},
    )
    return result.fetchone() is not None


def constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a constraint exists on a table."""
    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name = :t AND constraint_name = :c"
        ),
        {"t": table_name, "c": constraint_name},
    )
    return result.fetchone() is not None


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists."""
    conn = op.get_bind()
    result = conn.execute(
        text("SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
        {"t": table_name, "i": index_name},
    )
    return result.fetchone() is not None


def enum_exists(enum_name: str) -> bool:
    """Check if a PostgreSQL enum type exists."""
    conn = op.get_bind()
    result = conn.execute(
        text("SELECT 1 FROM pg_type WHERE typname = :n"),
        {"n": enum_name},
    )
    return result.fetchone() is not None
