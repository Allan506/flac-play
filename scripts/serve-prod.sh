#!/usr/bin/env bash
set -u

cd "$(dirname "$0")/.."

PORT="${PORT:-12000}"
HOST="${HOST:-0.0.0.0}"
export NODE_ENV=production
export PORT HOST
export TEMP_DIR="${TEMP_DIR:-$PWD/.tmp/downloads}"
mkdir -p "$TEMP_DIR"

child=''
watchdog=''

stop() {
  trap - INT TERM
  echo "[supervisor] $(date -Is) signal received; stopping"
  [ -n "$watchdog" ] && kill -KILL "$watchdog" 2>/dev/null || true
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || true
    sleep 2
    kill -KILL "$child" 2>/dev/null || true
  fi
  exit 0
}

trap stop INT TERM HUP

while true; do
  echo "[supervisor] $(date -Is) starting server on ${HOST}:${PORT}"
  node server/index.mjs &
  child=$!
  fails=0

  (
    while kill -0 "$child" 2>/dev/null; do
      sleep 15
      kill -0 "$child" 2>/dev/null || exit 0
      if node -e "fetch('http://127.0.0.1:${PORT}/api/health', { signal: AbortSignal.timeout(5000) }).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then
        fails=0
      else
        fails=$((fails + 1))
        echo "[supervisor] $(date -Is) health check failed (${fails}/3)"
        if [ "$fails" -ge 3 ]; then
          echo "[supervisor] $(date -Is) restarting unhealthy server"
          kill -TERM "$child" 2>/dev/null || true
          sleep 2
          kill -KILL "$child" 2>/dev/null || true
          exit 0
        fi
      fi
    done
  ) &
  watchdog=$!

  wait "$child"
  status=$?
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  watchdog=''
  child=''
  echo "[supervisor] $(date -Is) server exited status=${status}; restarting in 1s"
  sleep 1
done
