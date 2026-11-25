#!/usr/bin/env bash
# Builds the app, starts the real server and a plain static host, runs the Web Atelier chain.
set -euo pipefail
cd "$(dirname "$0")/.."
E2E_DIR="$(pwd)/.e2e-atelier"
export SITE_DIR="$E2E_DIR/site" SHOTS="${SHOTS:-$E2E_DIR/shots}"
rm -rf "$E2E_DIR"
mkdir -p "$SITE_DIR" "$SHOTS" "$E2E_DIR/data"
[ "${SKIP_BUILD:-}" = 1 ] || npm run build --silent >/dev/null
PORT=4173 DATA_DIR="$E2E_DIR/data" APP_DIR="$(pwd)/dist" node server/index.ts 2>/dev/null & APP_PID=$!
node scripts/static-server.mjs "$SITE_DIR" 4174 >/dev/null & SITE_PID=$!
trap 'kill $APP_PID $SITE_PID 2>/dev/null || true' EXIT
for _ in $(seq 100); do curl -sf -o /dev/null http://127.0.0.1:4173/ && break; sleep 0.1; done
SERVER=http://127.0.0.1:4173 KEYS="$E2E_DIR/demo-keys.json" node scripts/seed-demo.mjs
node scripts/e2e-atelier.mjs
