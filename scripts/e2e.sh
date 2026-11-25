#!/usr/bin/env bash
# Builds the app, starts the real server (app + publishing + guestbook) and a plain static host
# ("someone else's hosting"), runs the end-to-end check in headless Chromium, stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."
E2E_DIR="$(pwd)/.e2e"
SITE_DIR="${SITE_DIR:-$E2E_DIR/site}"
export SITE_DIR SHOTS="${SHOTS:-$E2E_DIR/shots}"
rm -rf "$E2E_DIR/data" "$SITE_DIR" "$SHOTS"
mkdir -p "$SITE_DIR" "$SHOTS" "$E2E_DIR/data"
npm run build --silent >/dev/null
PORT=4173 DATA_DIR="$E2E_DIR/data" APP_DIR="$(pwd)/dist" node server/index.ts 2>/dev/null & APP_PID=$!
node scripts/static-server.mjs "$SITE_DIR" 4174 >/dev/null & SITE_PID=$!
trap 'kill $APP_PID $SITE_PID 2>/dev/null || true' EXIT
for _ in $(seq 100); do curl -sf -o /dev/null http://127.0.0.1:4173/ && curl -s -o /dev/null http://127.0.0.1:4174/ && break; sleep 0.1; done
node scripts/e2e-check.mjs
