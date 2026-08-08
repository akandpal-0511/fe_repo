#!/usr/bin/env bash
# Dev launcher — starts backend + frontend for a chosen app.
# Usage:
#   ./start.sh ops-monitor    → port 8001 backend, 5173 frontend
#   ./start.sh data-entry     → port 8002 backend, 5174 frontend

set -e

APP=${1:-ops-monitor}

case "$APP" in
  ops-monitor)
    BACKEND_PORT=8001
    FRONTEND_PORT=5173
    ;;
  data-entry)
    BACKEND_PORT=8002
    FRONTEND_PORT=5174
    ;;
  data-entry-real)
    BACKEND_PORT=8003
    FRONTEND_PORT=5175
    ;;
  *)
    echo "Unknown app: $APP. Choose ops-monitor, data-entry, or data-entry-real."
    exit 1
    ;;
esac

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT/apps/$APP"
SRC_DIR="$ROOT/src"

echo "Starting $APP — backend :$BACKEND_PORT  frontend :$FRONTEND_PORT"

# activate venv
source "$ROOT/venv/bin/activate"

# backend
PYTHONPATH="$SRC_DIR" uvicorn main:app --reload --port "$BACKEND_PORT" --app-dir "$APP_DIR" &
BACKEND_PID=$!

# frontend — must cd first so vite uses the correct node_modules
cd "$APP_DIR/frontend"
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo "Backend PID $BACKEND_PID   Frontend PID $FRONTEND_PID"
echo "Open: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl-C to stop both"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" INT TERM
wait
