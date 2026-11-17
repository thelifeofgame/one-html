#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo 'Usage on your computer: bash scripts/tunnel.sh USER@SERVER_IP' >&2
  echo 'First run npm run dev on the server. Local ports 4391 and 4392 must be free.' >&2
  exit 1
fi
echo 'Keep this terminal open, then visit http://127.0.0.1:4391/ in your browser.'
exec ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:4391:127.0.0.1:4391 -L 127.0.0.1:4392:127.0.0.1:4392 -- "$1"
