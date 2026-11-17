#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$#" -ne 1 ]; then
  echo 'Usage: bash scripts/start-ip.sh SERVER_IPV4' >&2
  exit 1
fi
node --input-type=module -e 'import {isIP} from "node:net"; if(isIP(process.argv[1])!==4) { console.error("Provide the server IPv4 address."); process.exit(1); }' "$1"
app_port="${PORT:-4391}"
player_port="${SANDBOX_PORT:-4392}"
echo "IP preview: http://$1:$app_port"
echo "Player: http://$1.sslip.io:$player_port (independent hostname)"
echo 'Allow both ports in the server firewall. Google sign-in requires HTTPS or the SSH tunnel mode.'
exec env ONEHTML_SERVER_MODE=1 HOST=0.0.0.0 SITE_ORIGIN="http://$1:$app_port" SANDBOX_ORIGIN="http://$1.sslip.io:$player_port" PORT="$app_port" SANDBOX_PORT="$player_port" node --experimental-sqlite --no-warnings scripts/dev.mjs
