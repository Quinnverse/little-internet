#!/usr/bin/env bash
# Copies the data volume (published sites, guestbook, webring) to a dated tarball.
#   deploy/backup.sh [/root/little-internet-backups]
set -euo pipefail
OUT="${1:-/root/little-internet-backups}"
mkdir -p "$OUT"
FILE="$OUT/data-$(date +%Y%m%d-%H%M%S).tar.gz"
docker run --rm -v li-v3-data:/data:ro -v "$OUT":/out alpine \
  tar czf "/out/$(basename "$FILE")" -C /data .
echo "$FILE"
