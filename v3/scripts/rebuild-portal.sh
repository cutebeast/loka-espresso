#!/usr/bin/env bash
# Safe rebuild+restart for the Next.js portals.
#
# Why: `next build` wipes .next/ at the start — under a running server that
# means minutes of 502s plus a pm2 crash-restart loop ("Could not find a
# production build in the '.next' directory", seen repeatedly in the
# staff-portal/PWA error logs). This script builds to a SEPARATE directory
# (BUILD_DIST_DIR, honored by each portal's next.config.ts), then swaps it in
# during a brief pm2 stop. Downtime is seconds, not minutes, and the running
# server never sees a half-written build.
#
# Usage:  v3/scripts/rebuild-portal.sh <staff-portal|admin-portal|customer-pwa>
set -euo pipefail

PORTAL="${1:?usage: rebuild-portal.sh <staff-portal|admin-portal|customer-pwa>}"
case "$PORTAL" in
  staff-portal)  PM2_NAME="staff-portal-v3";  PORT=13820 ;;
  admin-portal)  PM2_NAME="admin-portal-v3";  PORT=13830 ;;
  customer-pwa)  PM2_NAME="customer-pwa-v3";  PORT=13810 ;;
  *) echo "unknown portal: $PORTAL" >&2; exit 1 ;;
esac

DIR="/root/fnb-super-app/v3/$PORTAL"
cd "$DIR"

echo "[1/4] $PORTAL: building to .next-fresh ..."
rm -rf .next-fresh
BUILD_DIST_DIR=.next-fresh npm run build

echo "[2/4] $PORTAL: swapping build directories (brief stop) ..."
pm2 stop "$PM2_NAME" >/dev/null
rm -rf .next-previous
[ -d .next ] && mv .next .next-previous
mv .next-fresh .next

echo "[3/4] $PORTAL: starting ..."
pm2 start "$PM2_NAME" --update-env >/dev/null

# The customer-pwa build is also served by kiosk-v3 and pos-disp-v3 — if they
# keep running on the pre-swap build, their HTML references chunks that no
# longer exist and the kiosk is a black screen. Restart them with every PWA
# rebuild.
if [ "$PORTAL" = "customer-pwa" ]; then
  echo "[+] restarting kiosk-v3 + pos-disp-v3 (they serve this same build) ..."
  pm2 restart kiosk-v3 pos-disp-v3 --update-env >/dev/null
fi

echo "[4/4] $PORTAL: waiting for health on :$PORT ..."
for i in $(seq 1 30); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" || true)
  case "$code" in
    200|301|302|307|308) echo "$PORTAL healthy (HTTP $code) after ~$((i*2))s"; exit 0 ;;
  esac
  sleep 2
done
echo "ERROR: $PORTAL did not become healthy in 60s — check: pm2 logs $PM2_NAME --nostream --lines 50" >&2
exit 1
