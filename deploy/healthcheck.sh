#!/usr/bin/env bash
# Health check. With no args, checks the local Caddy port from .env.
# Pass a full origin as $1 to check through the edge proxy (e.g. https://little.quinnverse.tech).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="$(grep -E '^CADDY_HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-8080}"
TARGET="${1:-http://127.0.0.1:${PORT}}"
curl -fsS --max-time 5 "${TARGET}/healthz" | grep -q '"status":"ok"'
echo "OK: ${TARGET}/healthz"
