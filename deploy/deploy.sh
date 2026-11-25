#!/usr/bin/env bash
# Builds a tagged image from the current checkout and (re)starts it. Keeps the previous tag for rollback.
#   deploy/deploy.sh            (run on the server, inside the repo checkout)
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="$(git rev-parse --short HEAD)"
PREV="$(docker inspect --format '{{.Config.Image}}' li-v3-app 2>/dev/null || true)"
[ -n "$PREV" ] && echo "$PREV" > deploy/.previous-image
TAG="$TAG" docker compose build
TAG="$TAG" docker compose up -d
for _ in $(seq 30); do curl -fsS "http://127.0.0.1:${PORT:-18090}/healthz" && echo && exit 0; sleep 1; done
echo "health check failed; roll back with deploy/rollback.sh" >&2
exit 1
