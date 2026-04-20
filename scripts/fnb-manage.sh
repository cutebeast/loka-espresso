#!/bin/bash
# ============================================================
# FNB Super-App Management Script
# Usage: ./fnb-manage.sh [command]
# ============================================================

set -e

BACKEND_DIR="/root/fnb-super-app/backend"
FRONTEND_DIR="/root/fnb-super-app/frontend"
CUSTOMER_DIR="/root/fnb-super-app/customer-app"

BACKEND_PORT=8000
FRONTEND_PORT=3001
CUSTOMER_PORT=3002

BACKEND_LOG="/tmp/fnb-backend.log"
FRONTEND_LOG="/tmp/fnb-admin.log"
CUSTOMER_LOG="/tmp/fnb-customer.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FNB]${NC} $1"; }
warn() { echo -e "${YELLOW}[FNB]${NC} $1"; }
err()  { echo -e "${RED}[FNB]${NC} $1"; }

kill_port() {
    local port=$1
    local pid=$(fuser $port/tcp 2>/dev/null | tr -d ' ')
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null || true
        warn "Killed process on port $port (PID: $pid)"
    fi
}

wait_for_port() {
    local port=$1
    local max_wait=${2:-10}
    local i=0
    while [ $i -lt $max_wait ]; do
        if fuser $port/tcp >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        i=$((i+1))
    done
    return 1
}

status() {
    echo ""
    echo "=== FNB Super-App Status ==="
    echo ""

    # Backend
    if fuser $BACKEND_PORT/tcp >/dev/null 2>&1; then
        local bpid=$(fuser $BACKEND_PORT/tcp 2>/dev/null | tr -d ' ')
        log "Backend      (port $BACKEND_PORT): RUNNING (PID: $bpid)"
    else
        err "Backend      (port $BACKEND_PORT): STOPPED"
    fi

    # Admin Frontend
    if fuser $FRONTEND_PORT/tcp >/dev/null 2>&1; then
        local fpid=$(fuser $FRONTEND_PORT/tcp 2>/dev/null | tr -d ' ')
        log "Admin App    (port $FRONTEND_PORT): RUNNING (PID: $fpid)"
    else
        err "Admin App    (port $FRONTEND_PORT): STOPPED"
    fi

    # Customer PWA
    if fuser $CUSTOMER_PORT/tcp >/dev/null 2>&1; then
        local cpid=$(fuser $CUSTOMER_PORT/tcp 2>/dev/null | tr -d ' ')
        log "Customer PWA (port $CUSTOMER_PORT): RUNNING (PID: $cpid)"
    else
        err "Customer PWA (port $CUSTOMER_PORT): STOPPED"
    fi

    # Caddy
    if pgrep caddy >/dev/null 2>&1; then
        log "Caddy        (port 443):  RUNNING"
    else
        err "Caddy        (port 443):  STOPPED"
    fi

    # Quick health checks
    echo ""
    local config=$(curl -s --max-time 3 "http://localhost:$BACKEND_PORT/api/v1/config" 2>/dev/null)
    if [ -n "$config" ]; then
        local ver=$(echo $config | python3 -c "import sys,json; print(json.load(sys.stdin).get('app_version','?'))" 2>/dev/null)
        log "Backend API:  OK (v$ver)"
    else
        err "Backend API:  NOT RESPONDING"
    fi

    local page=$(curl -s --max-time 3 "http://localhost:$FRONTEND_PORT" 2>/dev/null | head -1)
    if [[ "$page" == *"DOCTYPE"* ]]; then
        log "Admin App:    OK (serving HTML)"
    else
        err "Admin App:    NOT RESPONDING"
    fi

    local cpage=$(curl -s --max-time 3 "http://localhost:$CUSTOMER_PORT" 2>/dev/null | head -1)
    if [[ "$cpage" == *"DOCTYPE"* ]]; then
        log "Customer PWA: OK (serving HTML)"
    else
        err "Customer PWA: NOT RESPONDING"
    fi

    echo ""
}

start_backend() {
    log "Starting backend on port $BACKEND_PORT..."
    kill_port $BACKEND_PORT
    sleep 1
    cd $BACKEND_DIR
    setsid .venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > $BACKEND_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $BACKEND_PORT 5; then
        log "Backend started successfully"
    else
        err "Backend failed to start. Check $BACKEND_LOG"
        tail -20 $BACKEND_LOG
        return 1
    fi
}

start_frontend() {
    log "Starting admin frontend on port $FRONTEND_PORT..."
    kill_port $FRONTEND_PORT
    sleep 1
    cd $FRONTEND_DIR
    setsid npx next start -p $FRONTEND_PORT > $FRONTEND_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $FRONTEND_PORT 8; then
        log "Admin frontend started successfully"
    else
        err "Admin frontend failed to start. Check $FRONTEND_LOG"
        tail -20 $FRONTEND_LOG
        return 1
    fi
}

start_customer() {
    log "Starting customer PWA on port $CUSTOMER_PORT..."
    kill_port $CUSTOMER_PORT
    sleep 1
    cd $CUSTOMER_DIR
    setsid npx next start -p $CUSTOMER_PORT > $CUSTOMER_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $CUSTOMER_PORT 8; then
        log "Customer PWA started successfully (URL: https://app.loyaltysystem.uk)"
    else
        err "Customer PWA failed to start. Check $CUSTOMER_LOG"
        tail -20 $CUSTOMER_LOG
        return 1
    fi
}

stop() {
    log "Stopping all FNB services..."
    kill_port $CUSTOMER_PORT
    kill_port $FRONTEND_PORT
    kill_port $BACKEND_PORT
    log "All services stopped"
}

start() {
    start_backend
    start_frontend
    start_customer
    log "All services started"
}

restart() {
    stop
    sleep 2
    start
}

build_frontend() {
    log "Building admin frontend..."
    kill_port $FRONTEND_PORT
    cd $FRONTEND_DIR
    npx next build
    log "Admin frontend build complete"
    start_frontend
}

build_customer() {
    log "Building customer PWA..."
    kill_port $CUSTOMER_PORT
    cd $CUSTOMER_DIR
    npx next build
    log "Customer PWA build complete"
    start_customer
}

build() {
    build_frontend
    build_customer
}

rebuild() {
    log "Clean rebuild all frontends..."
    stop
    
    cd $FRONTEND_DIR
    rm -rf .next
    npx next build
    
    cd $CUSTOMER_DIR
    rm -rf .next
    npx next build
    
    start
}

logs() {
    echo ""
    echo "=== Backend Log (last 20 lines) ==="
    tail -20 $BACKEND_LOG 2>/dev/null || echo "(no log)"
    echo ""
    echo "=== Admin Frontend Log (last 20 lines) ==="
    tail -20 $FRONTEND_LOG 2>/dev/null || echo "(no log)"
    echo ""
    echo "=== Customer PWA Log (last 20 lines) ==="
    tail -20 $CUSTOMER_LOG 2>/dev/null || echo "(no log)"
    echo ""
}

verify() {
    log "Running verification..."
    echo ""

    # Auth check
    local token=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/v1/auth/login-password" \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

    if [ -z "$token" ]; then
        err "Auth FAILED"
        return 1
    fi
    log "Auth: OK"

    # Customer count
    local customers=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/customers?page=1&page_size=1" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
    log "Customers: $customers total"

    # Broadcasts
    local broadcasts=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/broadcasts?page=1&page_size=1&is_archived=false" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
    log "Active broadcasts: $broadcasts"

    echo ""
    log "Verification complete"
}

seed() {
    local seed_file="$BACKEND_DIR/seed_full.sql"
    if [ ! -f "$seed_file" ]; then
        err "Seed file not found: $seed_file"
        return 1
    fi
    warn "This will TRUNCATE all tables and re-seed. Are you sure?"
    log "Running seed data..."
    PGPASSWORD='Tmkh6HsdsOdzBEadYhJ6rafm6Tv-qlbMpuKfYtGyaQrR_MxGq1R317ctuz6zYF1K' \
        psql -h localhost -p 5433 -d fnb -U fnb -f "$seed_file"
    log "Seed data applied"
}

seed_loyalty() {
    local seed_file="/root/seed-loyalty-full.sql"
    if [ ! -f "$seed_file" ]; then
        err "Loyalty seed file not found: $seed_file"
        return 1
    fi
    log "Running loyalty/wallet seed data (append-only)..."
    PGPASSWORD='Tmkh6HsdsOdzBEadYhJ6rafm6Tv-qlbMpuKfYtGyaQrR_MxGq1R317ctuz6zYF1K' \
        psql -h localhost -p 5433 -d fnb -U fnb -f "$seed_file"
    log "Loyalty seed data applied"
}

# ============================================================
# Main
# ============================================================
case "${1:-}" in
    start)           start ;;
    stop)            stop ;;
    restart)         restart ;;
    status)          status ;;
    build)           build ;;
    build_admin)     build_frontend ;;
    build_customer)  build_customer ;;
    rebuild)         rebuild ;;
    logs)            logs ;;
    verify)          verify ;;
    seed)            seed ;;
    seed_loyalty)    seed_loyalty ;;
    backend)         start_backend ;;
    admin)           start_frontend ;;
    customer)        start_customer ;;
    *)
        echo "FNB Super-App Manager"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  start           Start all services (Backend, Admin, Customer PWA)"
        echo "  stop            Stop all services"
        echo "  restart         Stop and start all services"
        echo "  status          Check running services and health"
        echo "  build           Rebuild both Admin and Customer PWA and restart them"
        echo "  build_admin     Rebuild Admin only"
        echo "  build_customer  Rebuild Customer PWA only"
        echo "  rebuild         Clean rebuild (rm .next) of both apps and restart"
        echo "  logs            Show last 20 lines of all logs"
        echo "  verify          Run API health checks"
        echo "  seed            Apply seed_full.sql (TRUNCATES all tables)"
        echo "  seed_loyalty    Apply loyalty/wallet/transaction seed (append-style)"
        echo "  backend         Start Backend only"
        echo "  admin           Start Admin frontend only"
        echo "  customer        Start Customer PWA only"
        echo ""
        ;;
esac
