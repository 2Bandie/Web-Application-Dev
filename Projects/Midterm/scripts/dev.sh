#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x backend/.venv/bin/daphne || ! -d frontend/node_modules ]]; then
  printf 'Run ./scripts/setup.sh first.\n' >&2
  exit 1
fi
# Only stop the processes launched by this script.
backend_pid=''
frontend_pid=''
cleanup() {
  [[ -z "$backend_pid" ]] || kill "$backend_pid" 2>/dev/null || true
  [[ -z "$frontend_pid" ]] || kill "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
(cd backend && exec .venv/bin/daphne -b 127.0.0.1 -p 8001 config.asgi:application) &
backend_pid=$!
# Launch Vite directly so its PID can be stopped reliably.
(cd frontend && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5500 --strictPort) &
frontend_pid=$!
wait -n "$backend_pid" "$frontend_pid"
