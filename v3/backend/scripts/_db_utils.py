"""Small shared helpers for standalone DB scripts.

Kept minimal intentionally — each top-level script remains readable and
runnable on its own, while DB connection, environment guards, and truncate
logic are not duplicated across a dozen files.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Make the backend package importable when running scripts directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine


__all__ = [
    "SETTINGS",
    "get_db",
    "guard_production",
    "confirm",
    "truncate_tables",
]


SETTINGS = get_settings()


def guard_production(force_flag: bool) -> None:
    """Abort if the target DB looks like production and the force flag is absent."""
    env = (SETTINGS.environment or "").lower()
    db_url = SETTINGS.database_url or ""
    if env == "production" or "://prod" in db_url or "production" in db_url:
        if not force_flag:
            print("ERROR: This script refuses to run against a production environment.")
            print("       Pass --force-prod if you are absolutely sure.")
            sys.exit(1)
        print("WARNING: --force-prod supplied; running against production anyway.")


def confirm(prompt: str, yes_flag: bool) -> bool:
    """Return True if the user confirms or --yes was passed."""
    if yes_flag:
        return True
    try:
        answer = input(f"{prompt} [y/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("Aborted.")
        return False
    return answer in ("y", "yes")


@asynccontextmanager
async def get_db():
    """Yield an async SQLAlchemy session and commit/rollback automatically."""
    async with AsyncSessionLocal() as db:
        try:
            yield db
            await db.commit()
        except SQLAlchemyError as exc:
            await db.rollback()
            raise exc


async def truncate_tables(table_names: list[str], dry_run: bool = False) -> None:
    """Truncate a list of PostgreSQL tables in a single transaction.

    Tables must be ordered so that child tables come before parent tables.
    Uses CASCADE so FK references are handled safely.
    """
    if not table_names:
        return

    # Alembic version must never be touched
    if "alembic_version" in table_names:
        raise RuntimeError("Refusing to truncate alembic_version")

    quoted = ", ".join(f'"{name}"' for name in table_names)
    sql = text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE")

    if dry_run:
        print(f"[DRY-RUN] would execute: {sql}")
        return

    async with get_db() as db:
        await db.execute(sql)
        print(f"  Truncated {len(table_names)} table(s)")
