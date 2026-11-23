# Kiro development log

Raw notes kept during the build, used later for the "How we used Kiro" write-up.
Record what actually happened, including what did not work.

## 2026-11-23 — Day 1 (Kiro Web, Vibe mode)

**Steering first.** Wrote three steering files before any code:
`product.md` (frozen scope, single acceptance chain, priority order, ghost limited to 4
states), `tech.md` (core is pure TS; generated sites use relative URLs only), and
`security.md` (trust boundaries, output encoding, public-projection privacy rule). The
intent: stop scope creep and make security rules apply to every later session.

**Spec: `site-core`.** Requirements in EARS style (7 groups), design with 7 named
correctness properties (P1–P7), and 8 tasks. All 8 tasks implemented the same day.

**Property-based tests (fast-check).**
- P1 export→import round trip, P2 backup round trip, P3 no injected markup (checked by
  parsing every generated page with jsdom against an element/attribute allow-list),
  P4 private posts never exported (marker strings), P5 layout operations stay valid,
  P6 every reference relative and resolvable, P7 deterministic output.
- Generators deliberately mix attack strings (`</script>`, `"><svg onload=…>`, `]]>`,
  U+2028, `javascript:`) with random text.
- What PBT caught on day 1 (honest list): two bugs in the *test harness*, not the product —
  a `fc.subarray` length bug in the generator, and an over-broad check that flagged a site
  *title* of `javascript:alert(1)` as unsafe (it is harmless text; only `href`/`src` matter).
  No product bug found yet.

**Design decisions made with Kiro**
- Site export (public only, deployable) and private backup (includes drafts, never
  deployed) are separate functions and separate file formats, so a single flag can't leak
  drafts.
- Grid scales but never reflows: one layout contract for phone and desktop.
- Generated pages carry a strict CSP and no inline styles/scripts; ghost data travels in a
  JSON script tag.

**Independence check.** `npm run check:export` serves an unpacked export from `/` and
`/@moon/` with a bare static server and crawls every link.

**Blocked:** creating the GitHub repo from the sandbox returned 403.

**Product decision (later on day 1).** Repositioned from "build your own website" to
"a quiet, private-by-default home that can open its door". Added the voice time capsule
(real recordings in an answering-machine block), replacing the guestbook. Rejected for
this build: cloud LLM memory (contradicts private-by-default), voice cloning, memorial
modes. Steering `product.md` updated so every later Kiro session inherits these limits.

**Repo pushed** to https://github.com/Quinnverse/little-internet (MIT detected, `.kiro/` visible).

## 2026-11-23 — Day 1, later: editor spec

**Spec: `editor`.** 9 requirement groups, 4 properties (E1–E4), 10 tasks, all done.
Design choice worth noting: every UI change goes through a pure command and is validated by
the same zod schema as import, so the UI cannot save an invalid home.

**PBT found a weak generator, not a bug.** First run of E1–E4 passed suspiciously fast. A
probe showed fast-check's default size kept command sequences at 0–6 steps; raised to
10–40 steps (`size: 'max'`). Still passing. Lesson: check what generators actually produce.

**Preview = the real site.** The preview iframe is served by the editor's service worker
from Cache Storage filled with `generateSite` output, so there is no second renderer.

**End-to-end check.** `npm run e2e` drives headless Chromium on a 390×844 phone viewport
through setup → private + public entries → pin → move → preview → download → serve the ZIP
from a different origin → ghost guides visitor → re-import → reload. 19/19 pass.
Sandbox quirks hit: each shell command runs in its own isolated namespace, so the static
servers have to start in the same command as the test; the remote browser tool could not
reach the sandbox network, so Playwright was installed locally.
Test-harness fixes on the way: ambiguous accessible names (which also led to better
`aria-label`s on room tiles), and the bobbing ghost animation never being "stable" for
clicks (visitor context now uses reduced motion — and the site honours it).

## 2026-11-23 — Day 1, evening: multi-device + ghost spec

**Scope change from the owner:** not phone-only; tablet and desktop too. Updated steering
(`product.md`) and editor Requirement 9 before touching code, so the next tasks inherit it.
Desktop gets a side navigation and centred dialogs; icons moved from emoji to inline SVG
(headless Chromium had shown blank emoji, which is also what users without emoji fonts see).

**Spec: `ghost`.** Visitor ghost (4 states in `ghost.js`, public data only) and owner ghost
(on-device memories: *on this day* and *ask*). 4 properties G1–G4.

**First real bug found by property-based testing.** G1 generated the href
`" JAVASCRIPT:x"`. `ghost.js` checked for a scheme at position 0 only; browsers strip the
leading space, so the link would execute script. Fixed with an allow-list; the test now
resolves hrefs exactly like a browser. (Defence in depth: the core schema never produces
such data, but `ghost.js` runs in other people's hosting too.)

**Screenshots caught what tests did not.** Sheets opened from the dark "Midnight" room
inherited light text on a light sheet. Fixed, and added e2e assertions on computed colours
so it can't regress silently.

**e2e now 33 checks** across phone (390×844), tablet (820×1180) and desktop (1280×800).

## 2026-11-23 — Day 1, night: voice time capsule spec

**Spec: `voice-capsule`.** 4 requirement groups, 7 tasks, all done. The schema change was
additive (`recordings` with a zod default), so steering `tech.md` was updated with an
explicit rule for when a schema version bump is needed, instead of silently breaking it.

**Existing properties absorbed the new feature.** Adding recordings to the generators made
P1 (round trip), P2 (backup), P4 (privacy), P6 (references resolve) and P7 (determinism)
cover audio immediately; only P4 needed one extra assertion.

**e2e with a fake microphone.** Chromium's `--use-fake-device-for-media-stream` lets the
test go through the real MediaRecorder path. The test also synthesises a WebM clip in the
page (oscillator → MediaRecorder) to exercise "choose a file". It caught two real bugs
(`video/webm` MIME for audio files; ghost bubble opening off-screen at the top of a page).
41/41 checks.

## 2026-11-23 — Day 1, late: the room skin

The third theme is now the "room" (replacing `meadow`; old saves with `meadow` load as
`room`, covered by a test). It is pure CSS over the same grid and data: notebooks, picture
frames, a bookshelf, an answering machine, a rug under the ghost. One generator, so the
exported site, the preview and the editor all look the same.

**Screenshot review caught three things the assertions did not:** the RSS link sank into the
wooden floor (now on a cream pill); a 7 px horizontal scroll on phones, only while the
ghost's bubble was open (the bubble was nudged back on-screen with `transform`, which does
not change the page's scrollable width; now `left`/`right`); and the dark theme's sheet
colours (earlier). The overflow was found by having the e2e list overflowing elements and
then sampling the page before and after the bubble closed — the cause was not an element.

## 2026-11-23 — R1: online publish, privacy audit and competition package

**Goal (owner instruction):** stop adding features; make Little Internet truly
publishable, shareable, private and portable. No accounts, no new features.

**Serving the core in Node.** `generate.ts` imported the ghost runtime with
Vite-only `?raw`. Made `src/runtime/ghost.js` the single source of truth and
generated `src/core/ghost-source.ts` (a string constant) via
`scripts/build-ghost-source.mjs`. Both the browser build and the Node publish
server now import the same renderer. A property test asserts generated HTML has
no inline scripts beyond the JSON `ghost-data` block.

**Publish service (zero heavy deps).** `node:http` + the existing zod schemas +
`generateSite`. Strict publish envelope, media MIME/size/count limits, URL
allow-list, path-traversal guards, request-size cap, per-IP rate limit, salted
token-hash ownership, atomic dir swap with rollback, unpublish -> 410,
`Cache-Control: no-store`, health check and structured logs. The credential is
generated in the browser, stored only in localStorage and in `X-Site-Token`,
never in site.json / ZIP / logs.

**Real bugs found and fixed this round (not hypothetical):**
1. Username validation built a regex from `SITE_SLUG_PATTERN.toString()`, which
   embedded the `/.../` delimiters and rejected every name. Fixed by using the
   RegExp object directly; added cases for reserved/malformed/too-long names.
2. Oversized publish requests called `req.destroy()`, so the client got a
   connection reset instead of a clean 413. Fixed by draining the stream and
   returning a real 413; integration test asserts the 413 status.
3. Service-worker scope: the editor SW (scope `./`) would also cover
   `/@username/` when editor and sites share an origin, and its network-first
   shell cache could resurrect an unpublished site offline. Fixed by making the
   SW ignore `/@*`, `/api/*` and `/healthz` entirely.
4. Publish UI kept the "Unpublish" button after unpublishing because the button
   state was derived from localStorage at render time with no re-render. Fixed
   with explicit published-name state; E2E now asserts the button resets.
5. CORS preflight (OPTIONS) returned 404 when editor and API were on different
   origins. Added an optional `corsOrigin` (off by default; production is
   same-origin), so local E2E can drive the real UI.

**Verification actually run (2026-11-23):**
- Unit/property tests: 75 baseline -> 102 passed (added publish + privacy PBT).
- E2E on system Chrome: original 49/49; new publish E2E 12/12, including
  375/768/1440 viewports with no horizontal overflow and unpublish -> 410.
- Manual HTTP e2e against the real server binary: publish -> serve -> private
  media 404 -> unpublish -> 410.

**Honest tooling notes.** This build used Kiro Web in Vibe mode with steering
and spec-driven development. No Kiro hooks, custom agents, MCP servers or Kiro
Crew were configured, so the write-up says so rather than claiming them.
Playwright's browser download stalled in this environment; tests were driven
through the locally installed Google Chrome channel instead (no functional
difference for these checks). No physical iPhone/Android device was available:
the device checklist is explicitly NOT TESTED.

## 2026-11-23 — Production deploy + UI/UX polish

**UI/UX (owner: "UI/UX 都要优化，提高获奖概率").** After reviewing real E2E
screenshots: the published Room site was cramped into the left of a 1440px
screen and the ghost bubble covered the Friends block on 375px. Changed only
the shared CSS in `generate.ts` / `themes.ts` (no data, schema, or CSP changes):
responsive centred wrap, a framed wall-panel for Room on wide screens, footer
sinks to the bottom, refined typography, bounded ghost bubble. Re-ran 102 unit/PBT,
49 original E2E and 12 publish E2E — all green. Compared screenshots before/after.

**Same-origin publish API.** Editor default API base was hard-coded to
`little.quinnverse.tech` (no DNS), which would break publishing on any other
host. Default is now `location.origin`; overridable at build time or in-app.

**Production deployment (owner explicitly confirmed replacing the old site).**
The subdomain already resolved to the Tencent Cloud Shanghai host and had a
valid Certbot certificate, so no DNS change was needed. Backed up the previous
project (a narrative game) — nginx conf, image tar, data-volume tar — then
stopped/removed only its container. Little Internet now runs as a Node 22 Docker
container on `127.0.0.1:18081`; the existing nginx serves the editor statically
and reverse-proxies `/api/*`, `/healthz`, `/@*` to it. Only the one vhost changed;
all other Quinnverse sites untouched. Verified over public HTTPS: editor renders
in real Chrome with zero JS errors, publish → visit → privacy isolation →
unpublish → 410 all work. See `docs/production-deployment.md`.
