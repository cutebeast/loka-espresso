#!/bin/bash
# ============================================================
# FNB Super-App Management Script
# Usage: ./fnb-manage.sh [command]
#
# Port Assignments (Docker):
#   3001 = Admin Dashboard (frontend)
#   3002 = Backend API (fastapi/uvicorn)
#   3003 = Customer PWA (customer-app)
#
# Commands:
#   Local (scripted) mode:
#     start, stop, restart, status, build, rebuild, logs,
#     verify, health, migrate, install, setup
#
#   Note:
#     Build commands automatically deploy via docker compose when the
#     corresponding frontend service is already running in Docker.
#
#   Docker mode:
#     docker-up, docker-down, docker-build, docker-logs,
#     docker-status
#
#   Individual services:
#     backend, admin, customer
#
# Database seeding:
#   cd /root/fnb-super-app/scripts/seed
#   python3 verify_seed_00_full_reset.py
#   python3 verify_seed_01_stores.py
#   ... (run scripts 00-18 in order)
# ============================================================

set -e

PROJECT_DIR="/root/fnb-super-app"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
CUSTOMER_DIR="$PROJECT_DIR/customer-app"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

BACKEND_PORT=3002
FRONTEND_PORT=3001
CUSTOMER_PORT=3003

BACKEND_LOG="/tmp/fnb-backend.log"
FRONTEND_LOG="/tmp/fnb-admin.log"
CUSTOMER_LOG="/tmp/fnb-customer.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FNB]${NC} $1"; }
warn() { echo -e "${YELLOW}[FNB]${NC} $1"; }
err()  { echo -e "${RED}[FNB]${NC} $1"; }
info() { echo -e "${CYAN}[FNB]${NC} $1"; }

# ============================================================
# Utility Functions
# ============================================================

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

check_env() {
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        err "Missing .env file at $PROJECT_DIR/.env"
        err "Copy .env.example and fill in real values:"
        err "  cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env"
        return 1
    fi
}

update_pwa_version() {
    local dir=$1
    local build_date=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    local timestamp=$(date +%s)
    local version="1.0.${timestamp}"

    if [ -f "$dir/public/manifest.json" ]; then
        python3 -c "
import json
with open('$dir/public/manifest.json', 'r') as f:
    data = json.load(f)
data['version'] = '${version}'
data['build_date'] = '${build_date}'
with open('$dir/public/manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
print(f'Updated manifest.json: version=${version}')
"
    fi

    if [ -f "$dir/public/sw.js" ]; then
        sed -i "s|const CACHE_VERSION = 'v[^']*'|const CACHE_VERSION = 'v${version}'|" "$dir/public/sw.js"
        log "Updated sw.js version: ${version}"
    fi
}

docker_compose_available() {
    command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

docker_service_running() {
    local service=$1
    if ! docker_compose_available; then
        return 1
    fi
    cd $PROJECT_DIR
    docker compose -f $COMPOSE_FILE ps --status running "$service" 2>/dev/null | grep -q "$service"
}

docker_rebuild_service() {
    local service=$1
    local label=$2
    cd $PROJECT_DIR
    log "Rebuilding $label via docker compose..."
    docker compose -f $COMPOSE_FILE up -d --build "$service"
    log "$label deployed via Docker"
}

# ============================================================
# Install / Setup
# ============================================================

install_backend() {
    log "Installing backend dependencies..."
    cd $BACKEND_DIR
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        log "Created Python virtual environment"
    fi
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt
    log "Backend dependencies installed"
}

install_frontend() {
    log "Installing admin frontend dependencies..."
    cd $FRONTEND_DIR
    npm install --silent 2>/dev/null || npm install
    log "Admin frontend dependencies installed"
}

install_customer() {
    log "Installing customer PWA dependencies..."
    cd $CUSTOMER_DIR
    npm install --silent 2>/dev/null || npm install
    log "Customer PWA dependencies installed"
}

install_all() {
    install_backend
    install_frontend
    install_customer
    log "All dependencies installed"
}

setup() {
    log "=== First-time setup ==="
    echo ""

    # 1. Check env
    check_env || return 1

    # 2. Install dependencies
    install_all

    # 3. Run migrations
    run_migrations || return 1

    # 4. Build frontends
    build_frontend_silent
    build_customer_silent

    # 5. Start all services
    start_all

    echo ""
    log "=== Setup complete ==="
    log "Admin Dashboard:  http://localhost:$FRONTEND_PORT"
    log "Customer PWA:     http://localhost:$CUSTOMER_PORT"
    log "Backend API:      http://localhost:$BACKEND_PORT"
    log "API Docs:         http://localhost:$BACKEND_PORT/docs"
    echo ""
    warn "To seed the database, run:"
    warn "  cd $PROJECT_DIR/scripts/seed"
    warn "  Run verify_seed_00_full_reset.py through verify_seed_18_submit_feedback.py in order"
}

# ============================================================
# Migrations
# ============================================================

run_migrations() {
    log "Applying backend migrations..."
    cd $BACKEND_DIR
    if [ ! -d ".venv" ]; then
        err "Backend venv not found. Run './fnb-manage.sh install' first."
        return 1
    fi
    .venv/bin/alembic upgrade head >/tmp/fnb-alembic.log 2>&1 || {
        err "Alembic upgrade failed. Check /tmp/fnb-alembic.log"
        tail -20 /tmp/fnb-alembic.log
        return 1
    }
    log "Backend migrations up to date"
}

# ============================================================
# Start / Stop
# ============================================================

start_backend() {
    log "Starting backend on port $BACKEND_PORT..."
    kill_port $BACKEND_PORT
    sleep 1
    run_migrations || return 1
    cd $BACKEND_DIR
    setsid .venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > $BACKEND_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $BACKEND_PORT 8; then
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
    if [ ! -d ".next" ]; then
        warn "No build found. Building first..."
        npx next build
    fi
    setsid npx next start -p $FRONTEND_PORT > $FRONTEND_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $FRONTEND_PORT 10; then
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
    if [ ! -d ".next" ]; then
        warn "No build found. Building first..."
        update_pwa_version $CUSTOMER_DIR
        npx next build
    fi
    setsid npx next start -p $CUSTOMER_PORT > $CUSTOMER_LOG 2>&1 < /dev/null &
    disown
    if wait_for_port $CUSTOMER_PORT 10; then
        log "Customer PWA started successfully"
    else
        err "Customer PWA failed to start. Check $CUSTOMER_LOG"
        tail -20 $CUSTOMER_LOG
        return 1
    fi
}

stop_all() {
    log "Stopping all FNB services..."
    kill_port $CUSTOMER_PORT
    kill_port $FRONTEND_PORT
    kill_port $BACKEND_PORT
    log "All services stopped"
}

start_all() {
    check_env || return 1
    start_backend
    start_frontend
    start_customer
    log "All services started"
}

restart_all() {
    stop_all
    sleep 2
    start_all
}

# ============================================================
# Build
# ============================================================

build_frontend_silent() {
    log "Building admin frontend..."
    cd $FRONTEND_DIR
    rm -rf .next
    npx next build
    log "Admin frontend build complete"
}

build_customer_silent() {
    log "Building customer PWA..."
    cd $CUSTOMER_DIR
    update_pwa_version $CUSTOMER_DIR
    rm -rf .next
    npx next build
    log "Customer PWA build complete"
}

build_frontend_cmd() {
    if docker_service_running "frontend"; then
        docker_rebuild_service "frontend" "Admin frontend"
    else
        kill_port $FRONTEND_PORT
        build_frontend_silent
        start_frontend
    fi
}

build_customer_cmd() {
    if docker_service_running "customer-app"; then
        update_pwa_version $CUSTOMER_DIR
        docker_rebuild_service "customer-app" "Customer PWA"
    else
        kill_port $CUSTOMER_PORT
        build_customer_silent
        start_customer
    fi
}

build_all() {
    build_frontend_cmd
    build_customer_cmd
}

rebuild_all() {
    log "=== Clean rebuild ==="
    stop_all
    echo ""

    # Migrations
    run_migrations || return 1

    # Install latest deps
    install_backend
    install_frontend
    install_customer

    # Build
    build_frontend_silent
    build_customer_silent

    # Start
    start_all
}

# ============================================================
# Status / Health / Logs / Verify
# ============================================================

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

    # Quick HTTP checks
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

health() {
    log "Running health check..."
    echo ""

    # Backend /health endpoint
    local health_json=$(curl -s --max-time 5 "http://localhost:$BACKEND_PORT/health" 2>/dev/null)
    if [ -z "$health_json" ]; then
        err "Backend /health: NOT RESPONDING"
        return 1
    fi

    # Pretty-print the health JSON
    echo "$health_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
status = data.get('status', 'unknown')
icon = '✅' if status == 'healthy' else '❌'
print(f'{icon}  Overall: {status}')
print(f'   Version: {data.get(\"version\", \"?\")}')
print(f'   Time:    {data.get(\"timestamp\", \"?\")}')
checks = data.get('checks', {})
for name, check in checks.items():
    cs = check.get('status', 'unknown')
    ci = '✅' if cs == 'healthy' else '❌'
    extra = ''
    if 'response' in check:
        extra = f' ({check[\"response\"]})'
    elif 'error' in check:
        extra = f' ({check[\"error\"]})'
    elif 'path' in check:
        extra = f' ({check[\"path\"]})'
    print(f'{ci}  {name}: {cs}{extra}')
" 2>/dev/null

    # Backend /ready endpoint
    local ready=$(curl -s --max-time 3 "http://localhost:$BACKEND_PORT/ready" 2>/dev/null)
    if echo "$ready" | python3 -c "import sys,json; assert json.load(sys.stdin).get('ready')" 2>/dev/null; then
        log "Readiness: READY"
    else
        err "Readiness: NOT READY"
    fi

    echo ""
}

logs() {
    local lines=${2:-30}
    echo ""
    echo "=== Backend Log (last $lines lines) ==="
    tail -$lines $BACKEND_LOG 2>/dev/null || echo "(no log)"
    echo ""
    echo "=== Admin Frontend Log (last $lines lines) ==="
    tail -$lines $FRONTEND_LOG 2>/dev/null || echo "(no log)"
    echo ""
    echo "=== Customer PWA Log (last $lines lines) ==="
    tail -$lines $CUSTOMER_LOG 2>/dev/null || echo "(no log)"
    echo ""
}

verify() {
    log "Running full verification..."
    echo ""

    # 1. Health check
    health

    # 2. Auth check
    local token=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/v1/auth/login-password" \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@loyaltysystem.uk","password":"admin123"}' \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

    if [ -z "$token" ]; then
        err "Auth: FAILED (admin login returned no token)"
        return 1
    fi
    log "Auth: OK (admin token obtained)"

    # 3. Settings persistence check
    local test_key="_verify_test_$(date +%s)"
    local test_value="test-$(date +%s)"

    local save_result=$(curl -s -X PUT "http://localhost:$BACKEND_PORT/api/v1/admin/config?key=$test_key" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"value\": \"$test_value\"}" 2>/dev/null)

    local readback=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/config?key=$test_key" \
        -H "Authorization: Bearer $token" 2>/dev/null | \
        python3 -c "
import sys, json
data = json.load(sys.stdin)
configs = data.get('configs', data) if isinstance(data, dict) else {}
print(configs.get('$test_key', ''))
" 2>/dev/null)

    if [ "$readback" == "$test_value" ]; then
        log "Settings persistence: OK (save + readback matches)"
    else
        err "Settings persistence: FAILED (saved '$test_value' but read back '$readback')"
        err "  This indicates a database session / commit issue."
        err "  Check get_db() in backend/app/core/database.py"
    fi

    # Clean up test key
    curl -s -X PUT "http://localhost:$BACKEND_PORT/api/v1/admin/config?key=$test_key" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d '{"value": ""}' >/dev/null 2>&1

    # 4. Customer count
    local customers=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/customers?page=1&page_size=1" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d if isinstance(d, list) else d.get('customers', []))))" 2>/dev/null)
    log "Customers: $customers total"

    # 5. Stores
    local stores=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/stores?page=1&page_size=1" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d if isinstance(d, list) else d.get('stores', []))))" 2>/dev/null)
    log "Stores: $stores total"

    # 6. Broadcasts
    local broadcasts=$(curl -s "http://localhost:$BACKEND_PORT/api/v1/admin/broadcasts?page=1&page_size=1&is_archived=false" \
        -H "Authorization: Bearer $token" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d if isinstance(d, list) else d.get('broadcasts', []))))" 2>/dev/null)
    log "Active broadcasts: $broadcasts"

    # 7. Frontend serving
    local page=$(curl -s --max-time 3 "http://localhost:$FRONTEND_PORT" 2>/dev/null | head -1)
    if [[ "$page" == *"DOCTYPE"* ]]; then
        log "Admin frontend: OK (serving HTML)"
    else
        err "Admin frontend: NOT RESPONDING"
    fi

    local cpage=$(curl -s --max-time 3 "http://localhost:$CUSTOMER_PORT" 2>/dev/null | head -1)
    if [[ "$cpage" == *"DOCTYPE"* ]]; then
        log "Customer PWA: OK (serving HTML)"
    else
        err "Customer PWA: NOT RESPONDING"
    fi

    echo ""
    log "Verification complete"
}

envcheck() {
    log "Checking environment configuration..."
    echo ""

    if [ ! -f "$PROJECT_DIR/.env" ]; then
        err "MISSING: .env file not found"
        err "  Fix: cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env"
        return 1
    fi
    log "FOUND: .env file"

    # Check critical variables
    source <(grep -v '^#' $PROJECT_DIR/.env | grep '=' | sed 's/^/export /')

    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" == "change-me-to-a-random-64-char-string" ]; then
        err "INSECURE: JWT_SECRET not set or using default value"
    else
        log "OK: JWT_SECRET is set (${#JWT_SECRET} chars)"
    fi

    if [ -z "$WEBHOOK_API_KEY" ]; then
        warn "WARNING: WEBHOOK_API_KEY is empty — webhook endpoints will reject requests"
    else
        log "OK: WEBHOOK_API_KEY is set"
    fi

    if [ "$OTP_BYPASS_ALLOWED" == "true" ]; then
        warn "WARNING: OTP_BYPASS_ALLOWED=true — should be false in production"
    else
        log "OK: OTP_BYPASS_ALLOWED is false"
    fi

    if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" == "change-me-to-a-strong-password" ]; then
        err "INSECURE: DB_PASSWORD not set or using default"
    else
        log "OK: DB_PASSWORD is set"
    fi

    if [ -n "$JWT_EXPIRE_MINUTES" ] && [ "$JWT_EXPIRE_MINUTES" -gt 60 ]; then
        warn "WARNING: JWT_EXPIRE_MINUTES=$JWT_EXPIRE_MINUTES (recommended: 30 or less)"
    elif [ -n "$JWT_EXPIRE_MINUTES" ]; then
        log "OK: JWT_EXPIRE_MINUTES=$JWT_EXPIRE_MINUTES"
    fi

    if [ -n "$CORS_ORIGINS" ]; then
        log "OK: CORS_ORIGINS configured (${#CORS_ORIGINS} chars)"
    else
        warn "WARNING: CORS_ORIGINS is empty"
    fi

    echo ""
    log "Environment check complete"
}

# ============================================================
# Docker Commands
# ============================================================

docker_up() {
    log "Starting Docker stack..."
    cd $PROJECT_DIR
    docker compose -f $COMPOSE_FILE up -d --build
    log "Docker stack started"
    echo ""
    log "Services:"
    docker compose -f $COMPOSE_FILE ps
}

docker_down() {
    log "Stopping Docker stack..."
    cd $PROJECT_DIR
    docker compose -f $COMPOSE_FILE down
    log "Docker stack stopped"
}

docker_build() {
    log "Building Docker images..."
    cd $PROJECT_DIR
    docker compose -f $COMPOSE_FILE build --no-cache
    log "Docker images built"
}

docker_logs() {
    local service=${2:-""}
    cd $PROJECT_DIR
    if [ -n "$service" ]; then
        docker compose -f $COMPOSE_FILE logs --tail=50 "$service"
    else
        docker compose -f $COMPOSE_FILE logs --tail=30
    fi
}

docker_status() {
    cd $PROJECT_DIR
    echo ""
    echo "=== Docker Stack Status ==="
    echo ""
    docker compose -f $COMPOSE_FILE ps
    echo ""
}

# ============================================================
# Main
# ============================================================

case "${1:-}" in
    # Local service management
    start)           start_all ;;
    stop)            stop_all ;;
    restart)         restart_all ;;
    status)          status ;;
    build)           build_all ;;
    build_admin)     build_frontend_cmd ;;
    build_customer)  build_customer_cmd ;;
    rebuild)         rebuild_all ;;
    logs)            logs ;;
    verify)          verify ;;
    health)          health ;;
    migrate)         run_migrations ;;
    install)         install_all ;;
    setup)           setup ;;
    envcheck)        envcheck ;;
    backend)         start_backend ;;
    admin)           start_frontend ;;
    customer)        start_customer ;;

    # Docker
    docker-up)       docker_up ;;
    docker-down)     docker_down ;;
    docker-build)    docker_build ;;
    docker-logs)     docker_logs ;;
    docker-status)   docker_status ;;

    # Help
    -h|--help|help|"")
        echo "FNB Super-App Manager"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Service Commands:"
        echo "  start           Start all services (Backend, Admin, Customer PWA)"
        echo "  stop            Stop all services"
        echo "  restart         Stop and start all services"
        echo "  status          Check running services and HTTP health"
        echo ""
        echo "Build Commands:"
        echo "  build           Build both frontends and restart/deploy them"
        echo "  build_admin     Build Admin only and restart/deploy"
        echo "  build_customer  Build Customer PWA only and restart/deploy"
        echo "  rebuild         Clean rebuild (install deps + rm .next + build + start)"
        echo ""
        echo "Diagnostics:"
        echo "  health          Hit /health and /ready endpoints"
        echo "  verify          Full verification (health + auth + settings persistence + data)"
        echo "  envcheck        Validate .env configuration and security"
        echo "  logs [N]        Show last N lines of all logs (default: 30)"
        echo ""
        echo "Setup & Maintenance:"
        echo "  setup           First-time setup (install + migrate + build + start)"
        echo "  install         Install all dependencies (pip + npm)"
        echo "  migrate         Run Alembic database migrations"
        echo ""
        echo "Individual Services:"
        echo "  backend         Start Backend only"
        echo "  admin           Start Admin frontend only"
        echo "  customer        Start Customer PWA only"
        echo ""
        echo "Docker Commands:"
        echo "  docker-up       Build and start all containers via docker compose"
        echo "  docker-down     Stop and remove all containers"
        echo "  docker-build    Rebuild all Docker images (no cache)"
        echo "  docker-logs [S] Show container logs (optional: service name)"
        echo "  docker-status   Show container status"
        echo ""
        echo "Seed Data:"
        echo "  cd $PROJECT_DIR/scripts/seed"
        echo "  Run scripts verify_seed_00_full_reset.py through verify_seed_18_submit_feedback.py in order"
        echo ""
        ;;
esac
