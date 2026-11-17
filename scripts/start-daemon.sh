#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4391}"
SANDBOX_PORT="${SANDBOX_PORT:-4392}"
IP="43.161.242.122"

PID_FILE=".data/onehtml.pid"
LOG_FILE=".data/onehtml.log"

mkdir -p .data

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing OneHTML server (PID $OLD_PID)..."
    kill "$OLD_PID" || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

echo "Starting OneHTML on http://$IP:$PORT ..."
nohup env ONEHTML_SERVER_MODE=1 HOST=0.0.0.0 \
  PORT="$PORT" SANDBOX_PORT="$SANDBOX_PORT" \
  SITE_ORIGIN="http://$IP:$PORT" \
  SANDBOX_ORIGIN="http://$IP.sslip.io:$SANDBOX_PORT" \
  node --experimental-sqlite --no-warnings scripts/dev.mjs > "$LOG_FILE" 2>&1 &

NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "OneHTML started with PID $NEW_PID."
