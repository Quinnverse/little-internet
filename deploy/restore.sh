#!/usr/bin/env bash
# Restores sites/meta from a backup archive. DESTRUCTIVE: replaces current data.
# Usage: bash deploy/restore.sh ./backup-....tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVE="${1:?Usage: restore.sh <backup.tar.gz>}"
[ -f "$ARCHIVE" ] || { echo "ERROR: archive not found: $ARCHIVE"; exit 1; }
echo "WARNING: this replaces current sites/meta/trash with the backup contents."
read -r -p "Type RESTORE to continue: " ans
[ "$ans" = "RESTORE" ] || { echo "aborted"; exit 1; }

# Keep a safety copy of the current state first.
SAFETY="./data/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SAFETY"
[ -d data/sites ] && cp -a data/sites "$SAFETY/"
[ -d data/meta ] && cp -a data/meta "$SAFETY/"
echo "Current state copied to $SAFETY"

tar -xzf "$ARCHIVE" -C data
echo "Restore complete. Restart with: docker compose restart app"
