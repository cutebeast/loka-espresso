# Alembic Migrations

## Current Active Chain

There is a **single consolidated baseline migration** — no incremental chain.

| Revision | File | Description |
|----------|------|-------------|
| `5a81abc564c3` | `5a81abc564c3_baseline.py` | Consolidated baseline: all 54 tables, enums, constraints, and indexes, with Session 3 DB fixes baked in (RESTRICT on user FKs, payment_status CHECK constraints, missing FK indexes, device token length fix) |

**Head:** `5a81abc564c3`

## Running Migrations

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head       # Upgrade to latest (single baseline)
.venv/bin/alembic current            # Show current revision
.venv/bin/alembic history            # View full chain
```

## Creating a New Migration

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic revision -m "description" --head=$(.venv/bin/alembic current)
```

Edit the generated file to add your `upgrade()` and `downgrade()` operations.

## For Fresh Database Setup

For a brand-new PostgreSQL instance:

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic upgrade head
```

Then seed the database using the seed scripts:

```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_master_runner.py
```

## For Existing Databases (pre-Session 3)

If you have a database running an older migration chain, stamp the new baseline:

```bash
cd /root/fnb-super-app/backend
.venv/bin/alembic stamp 5a81abc564c3
```

This tells Alembic the database is already at the baseline revision without re-running table creation.

## Rules

1. **Never modify an already-run migration** — create a new one instead.
2. **Keep the chain linear** — avoid branches unless absolutely necessary.
3. **Document the purpose** in the migration docstring.
4. **Include both upgrade and downgrade** functions.
5. **Test downgrade** before committing.
