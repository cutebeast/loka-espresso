#!/usr/bin/env python3
"""Dump missing schema DDL from the app's SQLAlchemy metadata.

Compares ``backend/app/models`` (via ``Base.metadata``) against the hand-written
init scripts in ``infra/db`` and emits a Postgres init file containing:

- ``CREATE TABLE IF NOT EXISTS`` (+ indexes) for model tables missing from the SQL
- ``ALTER TABLE ... ADD COLUMN IF NOT EXISTS`` for model columns missing from
  tables that do exist in the SQL
- ``CREATE INDEX IF NOT EXISTS`` for model indexes missing from the SQL
  (e.g. indexes on post-baseline columns, which 04_indexes.sql cannot reference)
- an ``alembic_version`` stamp at the current head so the backend container's
  ``alembic upgrade head`` on boot is a no-op for a fresh SQL-initialised DB

New ENUM types must still be added to ``02_enums.sql`` by hand.

Regenerate after model changes (from the v3 root):

    cd backend && source .venv/bin/activate
    python3 ../scripts/dump_schema_sql.py

Output goes to ``infra/db/09_schema_sync.sql`` by default (``--output`` to change,
``-`` for stdout).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

V3_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = V3_DIR / "backend"
SQL_DIR = V3_DIR / "infra" / "db"
DEFAULT_OUTPUT = SQL_DIR / "09_schema_sync.sql"

sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402

from app.models import Base  # noqa: E402

DIALECT = postgresql.dialect()

# SQL clause starters that are table-level constraints, not column definitions
_CONSTRAINT_STARTERS = ("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "EXCLUDE", "LIKE")


def existing_schema() -> tuple[set[str], dict[str, set[str]], set[str]]:
    """Parse infra/db/*.sql for tables, their column names, and index names."""
    # Exclude previously generated output so regeneration stays stable
    sql = "\n".join(
        p.read_text() for p in sorted(SQL_DIR.glob("*.sql")) if "schema_sync" not in p.name
    )

    columns: dict[str, set[str]] = {}
    for m in re.finditer(
        r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\((.*?)\);", sql, re.S | re.I
    ):
        name, body = m.group(1), m.group(2)
        cols = columns.setdefault(name, set())
        depth, cur, items = 0, "", []
        for ch in body:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == "," and depth == 0:
                items.append(cur)
                cur = ""
            else:
                cur += ch
        items.append(cur)
        for item in items:
            tokens = item.strip().split()
            if not tokens or tokens[0].upper() in _CONSTRAINT_STARTERS:
                continue
            cols.add(tokens[0].strip('"'))

    for m in re.finditer(
        r"ALTER TABLE\s+(\w+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)", sql, re.I
    ):
        columns.setdefault(m.group(1), set()).add(m.group(2))

    indexes = {
        m.group(1)
        for m in re.finditer(
            r"CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF NOT EXISTS)?\s+(\w+)", sql, re.I
        )
    }

    return set(columns), columns, indexes


def column_ddl(column) -> str:
    """Compile a single column definition for ALTER TABLE ADD COLUMN."""
    parts = [column.name, column.type.compile(dialect=DIALECT)]
    if column.server_default is not None:
        arg = column.server_default.arg
        parts.append(f"DEFAULT '{arg}'" if isinstance(arg, str) else f"DEFAULT {arg}")
    elif column.default is not None and getattr(column.default, "is_scalar", False):
        # Mirror the ORM-side scalar default at the DB level so raw SQL
        # inserts (e.g. 10_seed_data.sql) behave like ORM inserts.
        val = column.default.arg
        if isinstance(val, bool):
            parts.append(f"DEFAULT {str(val).upper()}")
        elif isinstance(val, (int, float)):
            parts.append(f"DEFAULT {val}")
        else:
            parts.append(f"DEFAULT '{val}'")
    if not column.nullable:
        parts.append("NOT NULL")
    for fk in column.foreign_keys:
        parts.append(f"REFERENCES {fk.column.table.name} ({fk.column.name})")
    return " ".join(parts)


def alembic_heads() -> list[str]:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return sorted(ScriptDirectory.from_config(cfg).get_heads())


def generate() -> str:
    existing_tables, existing_columns, existing_indexes = existing_schema()
    model_tables = Base.metadata.tables

    missing_tables = [t for t in Base.metadata.sorted_tables if t.name not in existing_tables]
    altered = {
        name: [c for c in table.columns if c.name not in existing_columns[name]]
        for name, table in model_tables.items()
        if name in existing_tables
    }
    altered = {k: v for k, v in altered.items() if v}

    # Model indexes on existing tables that the hand-written SQL cannot create:
    # they reference post-baseline columns, which only this file adds (it runs
    # after 04_indexes.sql). Indexes on baseline columns belong in 04_indexes.sql.
    missing_indexes = [
        index
        for name in sorted(altered)
        for index in sorted(model_tables[name].indexes, key=lambda i: i.name or "")
        if index.name
        and index.name not in existing_indexes
        and any(c.name in {col.name for col in altered[name]} for c in index.columns)
    ]

    out = [
        "-- FNB Enterprise v3 — Schema sync (GENERATED — do not hand-edit)",
        "-- Regenerate: cd backend && source .venv/bin/activate \\",
        "--   && python3 ../scripts/dump_schema_sql.py",
        "-- Covers model tables/columns missing from 03_tables.sql. Runs before",
        "-- 10_seed_data.sql so seed data can rely on the full current schema.",
        "",
        "SET client_min_messages = warning;",
        "",
    ]

    if missing_tables:
        out.append("-- ============================================================")
        out.append("-- Tables present in app models but missing from 03_tables.sql")
        out.append("-- ============================================================")
        out.append("")
        for table in missing_tables:
            out.append(str(CreateTable(table, if_not_exists=True).compile(dialect=DIALECT)).strip() + ";")
            out.append("")
            for index in sorted(table.indexes, key=lambda i: i.name or ""):
                out.append(str(CreateIndex(index, if_not_exists=True).compile(dialect=DIALECT)).strip() + ";")
            if table.indexes:
                out.append("")

    if altered:
        out.append("-- ============================================================")
        out.append("-- Columns added to models after 03_tables.sql was written")
        out.append("-- ============================================================")
        out.append("")
        for name in sorted(altered):
            for column in altered[name]:
                out.append(f"ALTER TABLE {name} ADD COLUMN IF NOT EXISTS {column_ddl(column)};")
            out.append("")

    if missing_indexes:
        out.append("-- ============================================================")
        out.append("-- Indexes declared in models but missing from 04_indexes.sql")
        out.append("-- (must run after the ALTERs above when they index new columns)")
        out.append("-- ============================================================")
        out.append("")
        for index in missing_indexes:
            out.append(str(CreateIndex(index, if_not_exists=True).compile(dialect=DIALECT)).strip() + ";")
        out.append("")

    heads = alembic_heads()
    out.append("-- ============================================================")
    out.append("-- Alembic version stamp (current head at generation time)")
    out.append("-- Lets `alembic upgrade head` in the backend container apply only")
    out.append("-- migrations newer than this generated schema.")
    out.append("-- ============================================================")
    out.append("")
    out.append("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);")
    for head in heads:
        out.append(
            f"INSERT INTO alembic_version (version_num) SELECT '{head}'"
            " WHERE NOT EXISTS (SELECT 1 FROM alembic_version);"
        )
    out.append("")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", "-o", default=str(DEFAULT_OUTPUT), help="Output file ('-' for stdout)")
    args = parser.parse_args()

    sql = generate()
    if args.output == "-":
        print(sql)
    else:
        Path(args.output).write_text(sql)
        print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
