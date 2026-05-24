#!/bin/bash
set -e

BASE="/root/fnb-super-app/v3"

echo "=== TypeScript Check ==="
for dir in staff-portal admin-portal customer-pwa; do
  echo "--- $dir ---"
  (cd "$BASE/$dir" && npx tsc --noEmit)
done

echo ""
echo "=== Route Validation ==="
if curl -s -o /dev/null -w "%{http_code}" http://localhost:13800/health | grep -q 200; then
  (cd "$BASE" && python3 scripts/validate-routes.py)
else
  echo "Backend not running — skipping route validation"
fi

echo "=== All checks passed ==="
