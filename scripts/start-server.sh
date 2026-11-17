#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4391}"
SANDBOX_PORT="${SANDBOX_PORT:-4392}"
IP="43.161.242.122"

mkdir -p .data

# Kill any previous instance running on these ports
fuser -k "${PORT}/tcp" 2>/dev/null || true
fuser -k "${SANDBOX_PORT}/tcp" 2>/dev/null || true

echo "Starting OneHTML Server on port $PORT and sandbox $SANDBOX_PORT..."
nohup env ONEHTML_SERVER_MODE=1 HOST=0.0.0.0 \
  PORT="$PORT" SANDBOX_PORT="$SANDBOX_PORT" \
  SITE_ORIGIN="http://${IP}:${PORT}" \
  SANDBOX_ORIGIN="http://${IP}.sslip.io:${SANDBOX_PORT}" \
  node --experimental-sqlite --no-warnings scripts/dev.mjs > .data/server.log 2>&1 &

sleep 2
echo "Process launched with PID $(pgrep -f 'scripts/dev.mjs' || echo 'unknown')"
cat .data/server.log
