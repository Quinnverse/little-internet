#!/usr/bin/env bash
# Roll back the running app image to a previous build tag.
# Requires images built with a tag (see deploy/README.md "Image tags").
# Usage: bash deploy/rollback.sh <tag>
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?Usage: rollback.sh <image-tag>}"
echo "Rolling back app to little-internet-publish:${TAG}"
docker tag "little-internet-publish:${TAG}" little-internet-publish:local
docker compose up -d --no-build app
bash deploy/healthcheck.sh
echo "Rolled back to ${TAG}. Data volume was NOT changed."
