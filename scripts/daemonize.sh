#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/one-html/onehtml

PID_FILE=".data/onehtml.pid"
LOG_FILE=".data/onehtml.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "OneHTML already running with PID $OLD_PID."
    exit 0
  fi
fi

echo "Starting OneHTML background daemon..."
(
  export ONEHTML_SERVER_MODE=1
  export HOST="0.0.0.0"
  export PORT="4391"
  export SANDBOX_PORT="4392"
  export SITE_ORIGIN="http://43.161.242.122:4391"
  export SANDBOX_ORIGIN="http://43.161.242.122.sslip.io:4392"
  exec /opt/node24/bin/node --experimental-sqlite --no-warnings scripts/dev.mjs >> "$LOG_FILE" 2>&1
) &

PID=$!
echo "$PID" > "$PID_FILE"
disown -h "$PID"
echo "OneHTML daemon successfully detached with PID $PID."
sleep 1
cat "$LOG_FILE" | tail -n 5
