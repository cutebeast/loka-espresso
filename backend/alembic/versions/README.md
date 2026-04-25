# Alembic Migrations

## Current State

All migration files have been consolidated into `_archived/`. The 37 incremental migrations are preserved for reference.

## For Fresh Database Setup

Use the seed scripts instead of running migrations individually:

```bash
cd /root/fnb-super-app/scripts/seed
python3 verify_master_base_seed.py
```

The seed scripts use `POST /admin/system/init-hq` and `DELETE /admin/system/reset` endpoints which handle schema setup programmatically via the API layer.

## For Existing Databases

If your database already has the migrations applied (via `alembic upgrade head`), no action is needed. The alembic_version table tracks applied migrations and the archived files are not required at runtime.

## Re-applying Migrations

If you need to re-run migrations from scratch against a fresh PostgreSQL instance:

```bash
cd /root/fnb-super-app/backend
# Temporarily restore the archived migration you need
cp alembic/versions/_archived/395b86453379_all_tables_initial.py alembic/versions/
.venv/bin/alembic upgrade head
```
