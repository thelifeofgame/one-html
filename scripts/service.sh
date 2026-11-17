#!/usr/bin/env bash
cd /home/ubuntu/one-html/onehtml
exec /opt/node24/bin/node --experimental-sqlite --no-warnings scripts/dev.mjs
