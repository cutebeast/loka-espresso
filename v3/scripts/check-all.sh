#!/bin/bash
set -e

BASE="/root/fnb-super-app/v3"

echo "=== TypeScript Check ==="
for dir in staff-portal admin-portal customer-pwa; do
  echo "--- $dir ---"
  (cd "$BASE/$dir" && npx tsc --noEmit)
done
echo "=== All checks passed ==="
