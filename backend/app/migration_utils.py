"""Idempotent Alembic migration helpers."""
from alembic import op
from sqlalchemy import text


def _exec_scalar(sql: str, **params):
    conn = op.get_bind()
    return conn.execute(text(sql), params).scalar()


def table_exists(name: str) -> bool:
    return _exec_scalar(
        """SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = :name""",
        name=name,
    ) is not None


def column_exists(table: str, column: str) -> bool:
    return _exec_scalar(
        """SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = :table
             AND column_name = :column""",
        table=table,
        column=column,
    ) is not None


def index_exists(table: str, index: str) -> bool:
    return _exec_scalar(
        """SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND tablename = :table
             AND indexname = :index""",
        table=table,
        index=index,
    ) is not None


def constraint_exists(table: str, constraint: str) -> bool:
    return _exec_scalar(
        """SELECT 1 FROM information_schema.table_constraints
           WHERE table_schema = 'public'
             AND table_name = :table
             AND constraint_name = :constraint""",
        table=table,
        constraint=constraint,
    ) is not None
