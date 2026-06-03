#!/usr/bin/env bash
# Stop the detached local dev server (and any screen session named "tracker").
set -euo pipefail

PORT="${PORT:-8000}"
PIDFILE="/tmp/tracker-${PORT}.pid"

if lsof -ti ":${PORT}" >/dev/null 2>&1; then
  kill "$(lsof -ti ":${PORT}")"
  echo "Stopped server on port ${PORT}"
else
  echo "Nothing running on port ${PORT}"
fi

rm -f "${PIDFILE}"
screen -S tracker -X quit 2>/dev/null || true
