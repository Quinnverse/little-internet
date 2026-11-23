# Deploying Little Internet (independent subdomain)

This deploys a **self-contained** publish service on `little.quinnverse.tech`.
It does **not** touch the `quinnverse.tech` main site, any other Quinnverse
service, your DNS, or your existing proxy config. All of those are owner-owned
steps, listed below.

## Architecture

```
   Internet
      |  HTTPS (terminated at YOUR existing edge proxy / nginx)
      v
   edge proxy  ---- forwards little.quinnverse.tech ---->  Caddy :8080 (container)
                                                              |
                    /api/*  /healthz  /@*  -----------------> Node publish service :8788
                    everything else (editor PWA) ----------> dist/ (static files)
```

- **Node publish service** (`server/`): zero third-party deps beyond zod/fflate;
  validates, renders with the same `generateSite`, stores sites on a local volume.
- **Caddy**: static editor + reverse proxy. Default binding is host **8080 only**.
- **Data**: `./data/sites`, `./data/meta` (credential hashes), `./data/trash`
  (recent versions for rollback) — one persistent host directory.

Two deployment modes:

| Mode | Caddy ports | TLS | When to use |
|------|-------------|-----|-------------|
| **behind-proxy (default)** | host 8080 → container 80 | terminated by your existing edge | Recommended when 80/443 are already used by the main site |
| **standalone (optional)** | host 80/443 | Caddy ACME | Only if this host owns 80/443 and nothing else uses them |

## New machine, from zero

1. **Prerequisites**: Docker + Docker Compose plugin, Node 22+, git, curl.
   (`node -v` must be >= 22.18 for native TS type-stripping.)

2. **Get the code**:
   ```bash
   git clone https://github.com/Quinnverse/little-internet.git
   cd little-internet
   ```

3. **Configure**:
   ```bash
   cp .env.example .env
   # Generate a real salt and put it in .env:
   openssl rand -hex 32
   # Edit .env: SITE_TOKEN_SALT=<that value>, confirm PUBLIC_BASE_URL.
   ```
   Never commit `.env`. Rotating the salt invalidates all existing publish
   credentials (owners must re-publish).

4. **DNS (owner action, not performed by scripts)**:
   Add an `A` (and optionally `AAAA`) record:
   ```
   little.quinnverse.tech.   A    <this host's public IP>
   ```
   Wait for propagation (`dig +short little.quinnverse.tech`).

5. **Edge proxy (owner action)** — in your EXISTING main-site proxy, add a
   virtual host / location that forwards `little.quinnverse.tech` to
   `127.0.0.1:8080` and terminates TLS. Example (nginx):
   ```nginx
   server {
       listen 443 ssl http2;
       server_name little.quinnverse.tech;
       # ssl_certificate /...; ssl_certificate_key /...;  (your existing cert process)
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto https;
       }
   }
   ```
   This reuses your current 80/443 listener — no port conflict. If using the
   standalone mode instead, skip this and use `compose.standalone.yaml` (which
   needs 80/443 free and DNS pointing here before `up`).

6. **Build the editor** and start:
   ```bash
   bash deploy/deploy.sh
   ```
   This runs the tests, builds `dist/`, builds images, starts containers and
   waits for health.

7. **Verify**:
   ```bash
   bash deploy/healthcheck.sh                              # via local 8080
   bash deploy/healthcheck.sh https://little.quinnverse.tech  # via edge, if configured
   curl -I https://little.quinnverse.tech/                 # editor PWA loads
   ```

## Operations

- **Update**: pull new code, then `bash deploy/deploy.sh`.
- **Tag images for rollback**: after a good deploy,
  `docker tag little-internet-publish:local little-internet-publish:YYYYMMDD`.
  Roll back with `bash deploy/rollback.sh YYYYMMDD` (data volume untouched).
- **Backup** (do this regularly, store off-host):
  `bash deploy/backup.sh ./backup-YYYYMMDD.tar.gz`
  The archive contains owner credential hashes — treat as secret.
- **Restore** (destructive, asks for confirmation):
  `bash deploy/restore.sh ./backup-....tar.gz && docker compose restart app`
- **Logs**: `docker compose logs -f app` / `-f caddy`.
  Logs never contain tokens or site content (only method, path, status, timing).
- **Stop**: `docker compose down` (data in `./data` is preserved).

## Security notes

- Publish credential (site token) is generated in the browser, stored only in
  that browser's `localStorage`, sent in `X-Site-Token`, and persisted server-side
  only as a salted SHA-256 hash in `./data/meta`. It is never in `site.json`,
  RSS, the export ZIP, or logs.
- `TRUST_PROXY=0` by default. Only set to `1` if a single trusted proxy
  overwrites `X-Forwarded-For`; otherwise clients can spoof the rate-limit key.
- Published-site responses use `Cache-Control: no-store`; the editor service
  worker explicitly ignores `/@*`, `/api/*` and `/healthz`, so an unpublished
  site cannot be resurrected from the editor's offline cache.
- No accounts, no friends-only, no payments (competition scope). Friends-only
  later needs real server-side auth + revocation; the current two-state model
  is Private (local only) / Public (explicit publish).

## Data recovery / unpublish guarantees

Unpublish removes the site from the origin immediately (origin returns `410`).
Previously downloaded copies, RSS readers, search-engine and archive caches
cannot be recalled — this is stated in the editor UI and user docs.
