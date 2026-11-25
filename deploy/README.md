# Deploying Little Internet to little.quinnverse.tech

One container (`little-internet:<git sha>`) serves the editor app, published sites at `/@slug/`,
the webring at `/ring/` and the API. It listens on `127.0.0.1:18090` only. The host's nginx adds
HTTPS. Data (published sites, guestbook, webring) lives in the Docker volume
`little-internet_little-internet-v3`.

Nothing here touches other vhosts, the existing `resurrection.quinnverse.tech` container
(`little-internet-app`, port 18081) or its volume. Port 18090 and the volume name are new.

## Prerequisites (owner)
- DNS: `A little.quinnverse.tech → <server IP>` (check with `dig +short little.quinnverse.tech`).
- Docker with the compose plugin on the server; port 18090 free (`ss -ltnp | grep 18090`).

## First deploy
```bash
git clone --branch feat/web-atelier https://github.com/Quinnverse/little-internet.git /opt/little-internet-v3
cd /opt/little-internet-v3
chmod +x deploy/*.sh
deploy/deploy.sh                                # builds, starts, waits for /healthz

# HTTPS certificate (nginx HTTP block first, then issue, then the full config)
mkdir -p /var/www/certbot
certbot certonly --webroot -w /var/www/certbot -d little.quinnverse.tech
cp deploy/nginx-little.conf /etc/nginx/conf.d/little.quinnverse.tech.conf
nginx -t && systemctl reload nginx
curl -fsS https://little.quinnverse.tech/healthz
```
If the certificate does not exist yet, comment out the `443` server block, reload nginx, run
certbot, then restore the block.

## Publish the three demo homes
From any machine with the repo and Node 22.18+ (`npm ci` first):
```bash
SERVER=https://little.quinnverse.tech KEYS=~/.little-internet-demo-keys.json node scripts/seed-demo.mjs
```
Keep the keys file private and keep it: it is the only way to update or close the demo homes.
Re-running the command updates the same three sites.

Check: `https://little.quinnverse.tech/ring/` lists three homes; each `/@<slug>/` opens.

## Update, back up, restore, roll back
```bash
git pull && deploy/deploy.sh          # new version (previous image tag saved)
deploy/rollback.sh                    # back to the previous image, data untouched
deploy/backup.sh                      # tarball of the data volume → /root/little-internet-backups
deploy/restore.sh <tarball>
```
Suggested cron: `0 4 * * * /opt/little-internet-v3/deploy/backup.sh >/dev/null`

## Security notes
- Published pages are served with `Content-Security-Policy: sandbox …` (no same-origin), so a
  user's site cannot read the editor's data or publishing keys, even on the same domain.
- The server accepts only a valid, public-only `site.json` and real image files; guestbook notes are
  rate limited, length capped, plain text and pending until the owner approves them.
- Closing the door deletes the published copy from disk.
- A Shanghai host may be slow from overseas. Measure from outside China (e.g. a phone on a non-CN
  network) before the judging period; if needed, a static mirror of the demo homes can be exported
  with `Move my home → Download website ZIP` and hosted anywhere without the server.

## Old deployment
`resurrection.quinnverse.tech` still runs the older branch `feat/online-publish-r1`. It is separate
(different container, port and volume). Decide yourself whether to keep it, redirect it to
`little.quinnverse.tech`, or stop it.
