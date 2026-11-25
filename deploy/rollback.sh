#!/usr/bin/env bash
# Restarts the image that ran before the last deploy.sh. Data is untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
PREV="$(cat deploy/.previous-image)"
TAG="${PREV#li-v3:}" docker compose up -d --no-build
curl -fsS "http://127.0.0.1:${PORT:-18090}/healthz" && echo
