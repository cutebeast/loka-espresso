#!/usr/bin/env bash
set -euo pipefail

echo "=== FNB Enterprise v3 — Database Initialization ==="

# Config
DB_NAME="fnb_enterprise_v3"
DB_USER="fnb_user"
DB_PASS="fnb_pass"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-13334}"
PG_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "Target: ${PG_URL}"

# Check psql
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql not found. Install PostgreSQL client."
    exit 1
fi

# Check connection
echo "Checking connection..."
psql "${PG_URL}" -c "SELECT 1;" > /dev/null 2>&1 || {
    echo "ERROR: Cannot connect to database. Ensure PostgreSQL is running."
    exit 1
}

# Run schema files in order
SQL_DIR="$(dirname "$0")/../infra/db"

for f in \
    01_extensions.sql \
    02_enums.sql \
    03_tables.sql \
    04_indexes.sql \
    05_constraints.sql \
    06_triggers.sql \
    07_rls_policies.sql \
    08_seed_data.sql; do
    filepath="${SQL_DIR}/${f}"
    if [ -f "$filepath" ]; then
        echo "Applying ${f} ..."
        psql "${PG_URL}" -v ON_ERROR_STOP=1 -f "$filepath"
    else
        echo "WARNING: ${f} not found, skipping"
    fi
done

echo ""
echo "=== Database initialized successfully ==="
echo "DB: ${DB_NAME}"
echo "Next steps:"
echo "  1. cd v3/backend && alembic upgrade head"
echo "  2. uvicorn app.main:app --reload"
