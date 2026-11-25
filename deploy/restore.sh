#!/usr/bin/env bash
# Restores a backup made by backup.sh. Stops the app while copying.
#   deploy/restore.sh /root/little-internet-backups/data-YYYYmmdd-HHMMSS.tar.gz
set -euo pipefail
FILE="$1"
cd "$(dirname "$0")/.."
docker compose stop app
docker run --rm -v little-internet_little-internet-v3:/data -v "$(dirname "$FILE")":/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/$(basename "$FILE") -C /data && chown -R 1000:1000 /data"
docker compose start app
curl -fsS http://127.0.0.1:${PORT:-18090}/healthz && echo
