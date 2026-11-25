# Deploying to https://little.quinnverse.tech

> **Live deployment note (2026-11-25):** the actual contest URL is
> **https://resurrection.quinnverse.tech**, not `little.quinnverse.tech`
> (that hostname is NXDOMAIN). The live site runs the merged `main` (PR #2
> included) via the **existing** deployment: container `little-internet-app`
> on `127.0.0.1:18081`, nginx vhost `/etc/nginx/conf.d/resurrection.conf`
> serving `/opt/little-internet/dist`. `BASE=https://resurrection.quinnverse.tech
> node scripts/live-check.mjs` passed **44/44** from an overseas exit. The
> isolated `li-v3` / `little.quinnverse.tech` procedure below was NOT used;
> treat it as an alternative greenfield path only.

**Status: written and smoke-tested without Docker, never built or run in a container.** The
sandbox it was written in cannot run containers. What was verified: the exact file layout the image
copies, installed with production dependencies only, starts, passes `/healthz`, serves the app and
accepts the three demo homes. Expect to fix small Docker or nginx details on first run; every step
below prints what to check.

One container `li-v3-app` serves the app, published sites (`/@slug/`), the webring (`/ring/`) and
the API on `127.0.0.1:18090`. Data lives in the volume `li-v3-data`.

**Isolation from existing services** (all names are new): compose project `li-v3`, container
`li-v3-app`, image `li-v3:<sha>`, volume `li-v3-data`, port `18090`, directory `/opt/li-v3`, one
nginx file `little.quinnverse.tech.conf`. The older deployment (`little-internet-app`, port 18081,
volume `little-internet-data`, `resurrection.quinnverse.tech`) is not referenced by any command.

## 0. Check before you start (read-only)
```bash
dig +short little.quinnverse.tech          # must print the server IP
ss -ltn | grep -E ':18090\b' || echo "port 18090 free"
docker ps --format '{{.Names}} {{.Ports}}' # note the existing containers; they stay untouched
nginx -T 2>/dev/null | grep -c "little.quinnverse.tech"   # 0 = no vhost yet
```

## 1. Start the app (no HTTPS yet)
```bash
git clone --branch feat/web-atelier https://github.com/Quinnverse/little-internet.git /opt/li-v3
cd /opt/li-v3 && chmod +x deploy/*.sh && deploy/deploy.sh
curl -fsS http://127.0.0.1:18090/healthz        # {"status":"ok","sites":0}
```

## 2. nginx + HTTPS (only the new vhost)
```bash
mkdir -p /var/www/certbot
cp deploy/nginx-little-http.conf /etc/nginx/conf.d/little.quinnverse.tech.conf
nginx -t && systemctl reload nginx
certbot certonly --webroot -w /var/www/certbot -d little.quinnverse.tech
cp deploy/nginx-little.conf /etc/nginx/conf.d/little.quinnverse.tech.conf
nginx -t && systemctl reload nginx
curl -fsS https://little.quinnverse.tech/healthz
```
If `nginx -t` fails, restore nothing else: delete only
`/etc/nginx/conf.d/little.quinnverse.tech.conf`, `nginx -t && systemctl reload nginx`.
(nginx < 1.25: change `http2 on;` to `listen 443 ssl http2;`.)

## 3. Load the three demo homes
Run on any machine with Node 22.18+ and this repo (`npm ci` once):
```bash
SERVER=https://little.quinnverse.tech KEYS=$HOME/.li-demo-keys.json node scripts/seed-demo.mjs
```
`$HOME/.li-demo-keys.json` (mode 600) holds the only keys that can update or close the demo homes.
Back it up privately; never commit it. Re-running updates the same three sites.

## 4. Verify from outside China
```bash
BASE=https://little.quinnverse.tech node scripts/live-check.mjs
```
Prints PASS/FAIL per check with load times and sizes (see "Live acceptance" in `docs/`).

## Operate
```bash
deploy/deploy.sh                       # after git pull: new image tagged with the commit
deploy/rollback.sh                     # previous image, data untouched
deploy/backup.sh                       # → /root/little-internet-backups/data-<time>.tar.gz
deploy/restore.sh <tarball>            # stops li-v3-app, restores, starts, health check
# cron: 0 4 * * * /opt/li-v3/deploy/backup.sh >/dev/null
```

## If something fails
```bash
docker logs --tail 80 li-v3-app                      # app errors
docker inspect --format '{{.State.Health.Status}}' li-v3-app
curl -v http://127.0.0.1:18090/healthz               # app direct
curl -vk https://little.quinnverse.tech/healthz      # through nginx
nginx -t; tail -50 /var/log/nginx/error.log
docker compose -p li-v3 ps
```
- Build fails: send me the last 30 lines of `docker compose build`.
- `healthz` fails right after start: wait 10 s, then read `docker logs`.
- Roll back completely: `docker compose -p li-v3 down` (keeps the volume), remove
  `/etc/nginx/conf.d/little.quinnverse.tech.conf`, reload nginx. Nothing else changes.

## Security notes
- Published pages carry `Content-Security-Policy: sandbox …` (no same-origin): a user's page cannot
  read the editor's IndexedDB or publishing keys even on the same domain.
- The server stores only a SHA-256 hash of each owner key. Keys never appear in logs or URLs.
- The server accepts only a valid, public-only `site.json` and real image files; guestbook notes
  are rate limited, length capped, plain text and pending until approved.
- Closing the door deletes the published copy from disk.
- Not covered: abuse reporting and takedown process, antivirus on uploads, per-user quotas beyond the
  size limits. Decide these before opening publishing to the public beyond the demo period.
- Shanghai host: measure from outside China. If slow, the three demo homes can also be exported
  (Move my home → Download website ZIP) and hosted on any static host as a mirror.
