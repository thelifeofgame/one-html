#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/one-html/onehtml

export ONEHTML_SERVER_MODE=1
export HOST="0.0.0.0"
export PORT="4391"
export SANDBOX_PORT="4392"
export SITE_ORIGIN="http://43.161.242.122:4391"
export SANDBOX_ORIGIN="http://43.161.242.122.sslip.io:4392"

exec /opt/node24/bin/node --experimental-sqlite --no-warnings scripts/dev.mjs
