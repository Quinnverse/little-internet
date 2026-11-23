# Production deployment record

**Live:** https://resurrection.quinnverse.tech/ (editor PWA) and
`https://resurrection.quinnverse.tech/@<username>/` (published sites).

Deployed 2026-11-23 on the existing Tencent Cloud Shanghai host
(`124.223.15.11`, OpenCloudOS 9.6). No DNS change was required — the subdomain
already resolved to this host. The existing Certbot certificate for
`resurrection.quinnverse.tech` (valid to 2027-02-15) is reused; it is renewed by
the host's existing Certbot, not by this project.

## What was replaced

Before deployment this subdomain served a **different project**, a browser
narrative game titled "RESURRECTION — The Internet Remembers the Dead" (Docker
container `resurrection-preview`, image `resurrection:v5-20261119`, data volume
`resurrection_saves`, nginx `proxy_pass http://127.0.0.1:18080`). The owner
explicitly confirmed replacing it with Little Internet.

### Backup taken before replacement (on the server)

`/root/little-internet-backups/old-resurrection-20261123-215533/`:
- `resurrection.conf` — original nginx vhost
- `resurrection-image.tar` — full old container image (60 MB)
- `resurrection-saves.tar.gz` — old data volume
- `container-state.txt`

The old image and volume are **also still present** in Docker
(`docker images resurrection:v5-20261119`, `docker volume resurrection_saves`);
only the running container was stopped and removed.

## Current architecture on the host

```
Internet HTTPS (existing cert, nginx :443)
  resurrection.quinnverse.tech
    /                 -> static editor  /opt/little-internet/dist
    /api/*  /healthz  -> 127.0.0.1:18081  (Node publish container)
    /@*               -> 127.0.0.1:18081  (published static sites)
```

- Publish service: Docker container `little-internet-app`
  (image `little-internet-publish:local`, Node 22 inside), bound to
  `127.0.0.1:18081`, data in Docker volume `little-internet-data` (`/data`).
- Config: `/opt/little-internet/.env` (mode 600; contains `SITE_TOKEN_SALT` —
  do not print or commit it). `PUBLIC_BASE_URL=https://resurrection.quinnverse.tech`.
- nginx vhost: `/etc/nginx/conf.d/resurrection.conf`; pre-change copy at
  `/etc/nginx/conf.d/resurrection.conf.pre-li`.
- Only this one vhost was changed. All other Quinnverse sites and the main site
  config were left untouched. `nginx -t` passed before reload.

## Health checks

```bash
ssh root@124.223.15.11 'curl -s http://127.0.0.1:18081/healthz'
curl -s https://resurrection.quinnverse.tech/healthz
```

Both should return `{"status":"ok",...}`.

## Verified after deployment (real HTTP over public HTTPS)

- Editor home returns 200, renders in real Chrome, no JS errors, SW supported.
- Publish created `/@demo/`; public HTML contained public post, not private markers.
- `Cache-Control: no-store` on published pages; private asset path returned 404.
- Unpublish returned 200; the same URL then returned **410 Gone**.
- Demo site was unpublished, so the live site list is empty (ready for real users).

## Rollback

To restore the previous game site:

```bash
# 1. Restore the old vhost and reload
ssh root@124.223.15.11 '
  cp /etc/nginx/conf.d/resurrection.conf.pre-li /etc/nginx/conf.d/resurrection.conf
  nginx -t && nginx -s reload
  docker run -d --name resurrection-preview --restart unless-stopped \
    -p 127.0.0.1:18080:3000 -v resurrection_saves:/data \
    resurrection:v5-20261119
'
```

The full backup (including an image tar and volume tar) is in the backup dir
above if the in-Docker image/volume were ever removed.

## Updating the app later

1. Build/publish new code, upload source + `dist/` to `/opt/little-internet/`.
2. `docker build -t little-internet-publish:local /opt/little-internet`
3. `docker rm -f little-internet-app` then re-run the `docker run` above
   (the `little-internet-data` volume persists sites across redeploys — do NOT
   remove it).
4. `curl http://127.0.0.1:18081/healthz`.

## Known limitations of this deployment

- Single host, single container: adequate for a competition demo, not HA.
- Owner credential lives in each browser's localStorage; clearing browser data
  loses the ability to update/unpublish that site.
- Editors and published sites share one origin; the service worker explicitly
  ignores `/@*`, `/api/*` and `/healthz` so unpublish cannot be defeated by cache.
- Cross-border latency for overseas judges: a separate static mirror of an
  exported ZIP may be used for the demo if needed (see submission docs).
