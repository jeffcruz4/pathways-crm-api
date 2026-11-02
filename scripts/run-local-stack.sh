#!/usr/bin/env bash
###############################################################################
# Run the full Pathways CRM local stack:
#   Postgres (Docker) -> migrate + seed -> DB-backed API (:8080) -> UI (:5173)
#
# The API runs on :8080 with DATA_BACKEND=postgres so it matches the UI's
# apps/web/public/config.json (apiBaseUrl: http://localhost:8080). Long-running
# servers are launched in the background with logs under <api>/.local/logs and
# PIDs under <api>/.local/pids, so the script returns (works from a Kiro hook).
#
#   ./scripts/run-local-stack.sh          # start everything
#   ./scripts/run-local-stack.sh stop     # stop API + UI (leaves Postgres up)
#   ./scripts/run-local-stack.sh down      # stop everything incl. Postgres
###############################################################################
set -euo pipefail

# Resolve repo locations relative to this script (api repo = scripts/..).
API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$API_DIR/.." && pwd)"
UI_DIR="$ROOT_DIR/pathways-crm"

STATE_DIR="$API_DIR/.local"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# Local DB connection (matches docker-compose.dev.yml + the db:* scripts).
export DB_HOST=localhost DB_PORT=5433 DB_NAME=pathways \
  DB_USER=pathways DB_PASSWORD=pathways DB_SSLMODE=disable

log() { printf '\033[36m[pathways]\033[0m %s\n' "$*"; }
err() { printf '\033[31m[pathways]\033[0m %s\n' "$*" >&2; }

stop_proc() {
  local name="$1" pidfile="$PID_DIR/$1.pid"
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      log "stopping $name (pid $pid)"
      # Kill children first (pnpm spawns node/vite), then the launcher itself.
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

case "${1:-up}" in
  stop)
    stop_proc api
    stop_proc ui
    log "API + UI stopped. Postgres left running (use 'down' to stop it)."
    exit 0
    ;;
  down)
    stop_proc api
    stop_proc ui
    log "stopping Postgres"
    (cd "$API_DIR" && docker compose -f docker-compose.dev.yml down)
    log "everything stopped."
    exit 0
    ;;
  up) ;;
  *) err "unknown command: $1 (use: up | stop | down)"; exit 2 ;;
esac

# Pre-flight.
command -v docker >/dev/null 2>&1 || { err "docker not found on PATH"; exit 1; }
[ -d "$UI_DIR" ] || { err "UI repo not found at $UI_DIR"; exit 1; }

# 1) Postgres.
log "starting Postgres (docker-compose.dev.yml) …"
(cd "$API_DIR" && docker compose -f docker-compose.dev.yml up -d)

log "waiting for Postgres to be ready …"
for i in $(seq 1 30); do
  if docker exec pathways-pg pg_isready -U pathways >/dev/null 2>&1; then
    log "Postgres ready."
    break
  fi
  if [ "$i" = "30" ]; then err "Postgres did not become ready in time"; exit 1; fi
  sleep 1
done

# 2) Migrate + seed (idempotent-ish; seed truncates then inserts).
log "applying migrations …"
(cd "$API_DIR" && corepack pnpm db:migrate)
log "seeding sample data …"
(cd "$API_DIR" && corepack pnpm db:seed)

# 3) API on :8080, Postgres-backed (matches the UI config.json).
stop_proc api
log "starting API on http://localhost:8080 (backend=postgres) …"
(
  cd "$API_DIR"
  DATA_BACKEND=postgres PORT=8080 CORS_ORIGINS=http://localhost:5173 \
    corepack pnpm dev >"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$PID_DIR/api.pid"
)

# 4) UI on :5173.
stop_proc ui
log "starting UI on http://localhost:5173 …"
(
  cd "$UI_DIR"
  corepack pnpm dev >"$LOG_DIR/ui.log" 2>&1 &
  echo $! >"$PID_DIR/ui.pid"
)

# Wait for the API health check to flip to postgres.
log "waiting for the API to report backend=postgres …"
for i in $(seq 1 30); do
  if curl -fs --max-time 2 localhost:8080/healthz 2>/dev/null | grep -q '"backend":"postgres"'; then
    log "API healthy (backend=postgres)."
    break
  fi
  if [ "$i" = "30" ]; then
    err "API did not report healthy in time — see $LOG_DIR/api.log"
    break
  fi
  sleep 1
done

cat <<EOF

  Pathways CRM local stack is up:
    UI   ->  http://localhost:5173
    API  ->  http://localhost:8080   (GET /healthz -> backend=postgres)
    DB   ->  localhost:5433           (postgres/pathways)

  Logs:  $LOG_DIR/{api,ui}.log
  Stop:  ./scripts/run-local-stack.sh stop   (API + UI)
         ./scripts/run-local-stack.sh down   (+ Postgres)
EOF
