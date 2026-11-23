# Little Internet

**Your corner of the internet. Yours to keep.**

A mobile-first personal website creator built for **Kiroween 2026 — Resurrection**.
It resurrects the spirit of the early personal home page: a small, personal place
on the web that you own, decorate, and can take with you. No accounts, no feed,
no tracking — just your corner, open to visitors only when you say so.

> **Private by default. Personal by design. Portable by nature.**

---

## Why "Resurrection"?

The personal website died when social platforms swallowed the open web. Little
Internet brings it back — not as a nostalgia toy, but as a modern, privacy-first
PWA. You build a home on a snap grid, write a diary, leave yourself voice notes,
adopt a little ghost that greets visitors, and exchange links in a webring. Then
you either download the whole site as a static ZIP (host it anywhere, forever),
or publish it to a shareable `/@username/` URL. The old web's best idea — *a home
page that is actually yours* — rebuilt with today's offline, privacy and
property-based-testing practices.

## Features

- **Mobile-first editor PWA** — build your home on a 4-column snap grid; works
  on phone, tablet and desktop, installable to the home screen.
- **Private by default diary** — every new entry is private; open its "door" to
  make it public. Local full-text search over your own entries.
- **The Room** — a cozy skin with notebooks, frames, a shelf, an answering
  machine and a rug, rendered by the same generator as the exported site.
- **Little ghost** — a four-state visitor ghost (idle / sleep / react / guide)
  and an on-device "owner ghost" that remembers your entries privately.
- **Voice time capsule** — record messages in-browser; keep them private or let
  visitors hear them on a chosen date. Export as plain audio files.
- **Static site generator** — one renderer (`src/core/generate.ts`) produces the
  preview, the export ZIP and the published site. Strict CSP, escaped output,
  relative URLs, RSS feed, `site.json`.
- **Portable export / private backup** — a public-only website ZIP that runs on
  any static host, kept strictly separate from a private backup that never ships.
- **Online publishing (R1)** — publish to `https://little.quinnverse.tech/@username`,
  update, and unpublish. Ownership via a browser-local credential; no accounts.
- **Independent deployment** — Docker Compose + Caddy config that does not take
  over an existing site's 80/443.

### The publish loop

Create a space → choose public content → publish → get a URL → visitors browse →
update → unpublish. Unpublishing makes the origin return `410` immediately; the
editor service worker ignores published-site paths so a cached copy cannot bring
it back. Downloaded/third-party cached copies cannot be recalled (stated in the UI).

## Privacy model (competition scope)

Only two states exist:

- **Private** — visible only to the owner, on their device. Never uploaded.
- **Public** — only after the owner explicitly marks content public **and**
  publishes. Then it appears in HTML, RSS, media and `site.json`.

Friends-only is deliberately **not implemented**; doing it correctly requires
real server-side authentication, per-user authorization and credential
revocation. Those are future work. See [`docs/privacy-audit.md`](docs/privacy-audit.md)
for the ten checks and where each is enforced.

## Architecture

```
                        +---------------------------+
  Owner's phone  --->   |  Editor PWA (Preact)      |   localStorage: site token
                        |  src/editor/              |   IndexedDB: private data
                        +-------------+-------------+
                                      | buildPublishEnvelope (public projection only)
                                      v
  Caddy (static editor + reverse proxy)  ---- /@*, /api/*, /healthz ---+
                        |                                             v
                        |                              +---------------------------+
                        +-- dist/ (editor)             | Publish service (node:http)|
                                                       | src/core/generate.ts       |
                                                       | zod validation, atomic FS  |
                                                       | data/sites, data/meta      |
                                                       +---------------------------+

  Same core renderer (src/core/) powers: live preview, static export ZIP, and online publish.
  Publish artifact == export ZIP artifact (asserted by tests).
```

- `src/core/` — pure, framework-free TypeScript: data model, layout, generator,
  RSS, ZIP. Importable in Node (native TS type-stripping, Node >= 22.18).
- `src/editor/` — the Preact UI and browser publish client.
- `server/` — dependency-light publish API and filesystem store.
- `deploy/` — Compose, Caddyfiles and operations scripts.
- `.kiro/` — specs and steering (see below).

## How Kiro was used

This project was built with **Kiro Web (Vibe mode)** using:

- **Steering docs** (`.kiro/steering/`) written before any code — `product.md`
  (frozen scope), `tech.md` (pure core, relative URLs, PBT rule), `security.md`
  (trust boundaries, output encoding, public-projection privacy rule). Every
  later session inherited them, which is why scope did not drift.
- **Spec-driven development** — four specs (`.kiro/specs/`: `site-core`,
  `editor`, `ghost`, `voice-capsule`), each with requirements (EARS style),
  design and tasks. Named correctness properties (P1–P7, E1–E4, G1–G4) guided
  implementation.
- **Property-based testing** with `fast-check` — generated hostile strings
  (`</script>`, `" onload=`, `javascript:`, U+2028) and asserted universal
  invariants. PBT caught a real XSS-class bug in the ghost href allow-list
  (`" JAVASCRIPT:x"`) and drove several test-generator corrections.
- **Screenshot + E2E review** — caught a dark-theme contrast bug and a 7px
  mobile horizontal scroll that unit tests missed; both fixed with regression
  assertions.

**Not used (stated honestly):** Kiro hooks, custom agents, MCP servers and Kiro
Crew were not configured in this build, so no claims are made about them. See
[`docs/kiro-writeup.md`](docs/kiro-writeup.md) for the full, evidence-based
write-up and [`docs/kiro-directory.md`](docs/kiro-directory.md) for `.kiro/`.

## Development

Requires Node 22.18+ (native TS type-stripping) and npm.

```bash
npm install
npm test              # unit + property tests (single run)
npm run typecheck     # strict TypeScript
npm run build         # tsc + Vite build -> dist/
npm run dev           # local editor dev server
```

### Tests — actually run

| Suite | Command | Result (this build) |
|-------|---------|---------------------|
| Unit + property | `npm test` | **102 passed** (75 original + 27 new) |
| Original E2E (real Chrome) | `npm run e2e` | **49/49 passed** |
| Publish E2E (real Chrome) | `npm run e2e:publish` | **12/12 passed** |
| Publish service manual HTTP | curl against `node server/index.mjs` | publish/serve/unpublish verified |

E2E uses the locally installed Google Chrome channel when present; otherwise
install Playwright Chromium with `npx playwright install chromium`. Physical
device testing is **NOT TESTED** — see
[`docs/user-testing/device-checklist.md`](docs/user-testing/device-checklist.md).

## Running the publish service locally

```bash
cp .env.example .env
# set SITE_TOKEN_SALT=$(openssl rand -hex 32), PUBLIC_BASE_URL=http://127.0.0.1:8788
DATA_DIR=./data SITE_TOKEN_SALT=dev PORT=8788 HOST=127.0.0.1 npm run server
curl http://127.0.0.1:8788/healthz
```

## Deployment

See [`deploy/README.md`](deploy/README.md) for the full independent deployment:
Docker Compose + Caddy, DNS notes, backup/restore, rollback, and the owner-only
steps. The default Compose binds only host `8080` and does **not** touch an
existing site's 80/443.

**Status:** `PRODUCTION_DEPLOYED = YES` — live at
**https://resurrection.quinnverse.tech/** (editor) and
`https://resurrection.quinnverse.tech/@<username>/` (published sites), on the
existing Tencent Cloud Shanghai host. HTTPS uses the pre-existing Certbot
certificate; nginx serves the editor statically and reverse-proxies `/api/*`,
`/healthz` and `/@*` to the publish service on `127.0.0.1:18081`. The previous
site on this subdomain was backed up before replacement (see
[`docs/production-deployment.md`](docs/production-deployment.md)). No DNS change
was needed (the subdomain already pointed at the host); no other Quinnverse site
or the main site config was touched. `LOCAL_RELEASE_READY = YES` — all local
checks, build, deployment package and tests pass.

## What to submit to Kiroween

See [`docs/kiroween-submission.md`](docs/kiroween-submission.md) (checklist,
Devpost copy, 3-minute demo script, shot list) and
[`docs/kiro-writeup.md`](docs/kiro-writeup.md).

## Trial materials

[`docs/user-testing/`](docs/user-testing/) — one-page EN/ZH instructions,
5-minute task script, feedback and results templates, and a real-device checklist.

## License

MIT — see [LICENSE](LICENSE). Detectable and visible at the repo root, as
Kiroween requires. The `.kiro/` directory is tracked and not gitignored.
