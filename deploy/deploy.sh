#!/usr/bin/env bash
# Deploy / update Little Internet publish service. Run from repo root.
# Does NOT touch any other Quinnverse service, DNS, or your main site's proxy.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Preflight"
[ -f .env ] || { echo "ERROR: .env missing. Copy .env.example and set SITE_TOKEN_SALT."; exit 1; }
grep -q 'SITE_TOKEN_SALT=REPLACE' .env && { echo "ERROR: set a real SITE_TOKEN_SALT in .env first."; exit 1; }
command -v docker >/dev/null || { echo "ERROR: docker not installed."; exit 1; }

echo "==> Build editor PWA (dist/)"
npm install --no-audit --no-fund
npm test
npm run build

echo "==> Build & start containers"
docker compose up -d --build --remove-orphans

echo "==> Health check (waiting up to 30s)"
for i in $(seq 30); do
  if bash deploy/healthcheck.sh >/dev/null 2>&1; then echo "healthy"; break; fi
  sleep 1
  [ "$i" -eq 30 ] && { echo "ERROR: health check failed"; docker compose logs --tail=50; exit 1; }
done
echo "==> Deployed. Editor: /  |  API: /healthz  |  Sites: /@<username>/"
