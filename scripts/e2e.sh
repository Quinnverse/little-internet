#!/usr/bin/env bash
# Builds the editor, starts two plain static servers (editor app + "someone else's host"),
# runs the end-to-end check, and stops the servers.
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_DIR="${SITE_DIR:-$(pwd)/.e2e/site}"
export SITE_DIR SHOTS="${SHOTS:-$(pwd)/.e2e/shots}"
mkdir -p "$SITE_DIR" "$SHOTS"
npm run build --silent >/dev/null
node scripts/static-server.mjs dist 4173 & APP_PID=$!
node scripts/static-server.mjs "$SITE_DIR" 4174 & SITE_PID=$!
trap 'kill $APP_PID $SITE_PID 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf -o /dev/null http://127.0.0.1:4173/ && curl -s -o /dev/null http://127.0.0.1:4174/ && break; sleep 0.1; done
node scripts/e2e-check.mjs
