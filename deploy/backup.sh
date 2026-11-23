#!/usr/bin/env bash
# Backs up ALL published sites and owner credentials (./data, excluding Caddy caches).
# Store the resulting file somewhere private and off this host.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d data/sites ] || { echo "ERROR: no data/sites directory found."; exit 1; }
OUT="${1:-./backup-$(date -u +%Y%m%dT%H%M%SZ).tar.gz}"
umask 077
tar -czf "$OUT" -C data sites meta trash
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
echo "This archive contains owner credential hashes; keep it private."
