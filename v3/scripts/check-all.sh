#!/bin/bash
set -e

BASE="/root/fnb-super-app/v3"

echo "=== TypeScript Check ==="
for dir in staff-portal admin-portal customer-pwa; do
  echo "--- $dir ---"
  (cd "$BASE/$dir" && npx tsc --noEmit)
done

echo ""
echo "=== Alembic Drift Check ==="
(cd "$BASE/backend" && source .venv/bin/activate && alembic check)

echo ""
echo "=== Backend Unit Tests ==="
(cd "$BASE/backend" && source .venv/bin/activate && pytest tests/ -q)

echo ""
echo "=== Route Validation ==="
if curl -s -o /dev/null -w "%{http_code}" http://localhost:13800/health | grep -q 200; then
  (cd "$BASE" && python3 scripts/validate-routes.py)
else
  echo "Backend not running — skipping route validation"
fi

# NOTE: lint runs last — the portals carry pre-existing eslint errors
# (staff 309 / admin 795 / pwa 244 as of round 35) which abort the script
# under set -e; keeping it last lets every other check run first.
echo ""
echo "=== ESLint ==="
for dir in staff-portal admin-portal customer-pwa; do
  echo "--- $dir ---"
  (cd "$BASE/$dir" && npm run lint)
done

echo "=== All checks passed ==="
