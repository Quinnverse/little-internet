#!/usr/bin/env bash
# Builds the app, starts the real server on a clean data dir and runs the two-profile Heart Mail flow.
set -euo pipefail
cd "$(dirname "$0")/.."
D="$(pwd)/.e2e-mail-data"
rm -rf "$D"; mkdir -p "$D/data"
[ "${SKIP_BUILD:-}" = 1 ] || npm run build --silent >/dev/null
PORT=4175 DATA_DIR="$D/data" APP_DIR="$(pwd)/dist" node server/index.ts 2>/dev/null & PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 100); do curl -sf -o /dev/null http://127.0.0.1:4175/healthz && break; sleep 0.1; done
BASE=http://127.0.0.1:4175 node scripts/e2e-mail.mjs
BASE=http://127.0.0.1:4175 node scripts/e2e-gift-public.mjs
