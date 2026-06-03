#!/usr/bin/env bash
# Start the local tracker UI on port 8000, detached so you can close the terminal tab.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"
PIDFILE="/tmp/tracker-${PORT}.pid"
LOG="/tmp/tracker-${PORT}.log"

if lsof -ti ":${PORT}" >/dev/null 2>&1; then
  echo "Already running on http://localhost:${PORT} (PID $(lsof -ti ":${PORT}"))"
  exit 0
fi

cd "$ROOT"
nohup python3 -m http.server "${PORT}" >> "${LOG}" 2>&1 &
echo $! > "${PIDFILE}"
disown -h "$!" 2>/dev/null || true

echo "Started on http://localhost:${PORT} (PID $(cat "${PIDFILE}"))"
echo "Log: ${LOG}"
echo "Stop with: ./scripts/stop-dev-server.sh"
