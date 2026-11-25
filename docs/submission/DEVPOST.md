# Devpost submission draft: Little Internet

**Status of this draft:** text only. Nothing here is submitted. Items marked **[OWNER]** need you.

## Rules check (read this first)
- Official rules: https://kiroween.devpost.com/rules. **My automated fetch of that page returned HTTP 403**, so I could
  not read the 2026 rules myself. Search results I could reach describe the **2025** edition (submission period ended
  5 Dec 2025) and list: a working application that uses Kiro, a `.kiro/` directory at the repository root that is not
  git-ignored, a public repository with an OSI-approved licence, a demo video under three minutes, a write-up of how Kiro
  was used, and category-specific fit. An earlier session of this project recorded a 2026 deadline of **2026-12-04, 2:00 PM Pacific**
  and a submission period of 2026-10-30 to 2026-12-04; I could not reconfirm that. **[OWNER] Re-read the rules page yourself,
  including eligibility, whether work started before the submission period is allowed, and the exact deadline.**
  This repository's first commit is dated 2026-11-23.
- Prize amounts and win chances are not stated here on purpose.

## Title
Little Internet: a home and a website you build yourself, and take with you

## Tagline
The internet used to feel like a place. Let's make it feel like home again.

## Category
Resurrection: the GeoCities-era personal homepage.

## What it does
Little Internet is a small 3D home in the browser plus a visual website builder, both owned by you.
- **A room that holds your life.** Write entries (private by default), keep a voice message on an answering
  machine, and optionally turn an entry into an object on a shelf. You choose; the app never reads your text to decide.
- **Web Atelier.** Decorate your own website the way people built GeoCities pages: pick components, drag to
  reorder, set tiled backgrounds, fonts, borders, stickers, GIFs, an 88×31 badge, a guestbook, a webring, an
  "under construction" sign. It is a real editor with undo, phone preview and a draft that stays hidden until you publish,
  not a template switch.
- **Neighbours without an algorithm.** Join a webring on purpose; Prev/Next/Random links go to real published homes.
- **Close the Door.** One button deletes the published copy and removes you from the webring.
- **Move my home.** Download a website ZIP that opens offline and runs on any static host, or a private backup that
  restores everything.
- **Three demo homes** with three fictional owners and three very different sites, built with the same editor and
  published through the same API as anyone's, and a **Try a demo home** button that gives a private, resettable copy.

## Why it fits Resurrection
Early personal homepages were hand-made, personal and owned by their authors: a guestbook, friend links, a
webring, a badge. Platforms replaced that with feeds. We bring back the *making* and the *place*, with what we know now:
private by default, no account, no algorithm, export everything, and publishing as a deliberate act.

## How it differs from nearby things (based on public descriptions; not tested head to head)
- **Browser 3D room builders (for example Rooms.xyz):** rooms are the product. Here the room is one view of your
  entries and your own website; the same content feeds the Journal and the website, and the website is a first-class,
  exportable, independently hosted artefact.
- **Neocities and other static homepage hosts:** they keep the handmade web alive for people who write HTML. Little
  Internet adds a visual editor, a private journal that never leaves your device unless you publish, a privacy
  projection checked by tests, and a webring and 88×31 badge built into the product. It is not a hosting replacement.
- **Ordinary blogs and social feeds:** no timeline, no follower counts, no ranking; every entry is private until you
  open the door; the site design is yours rather than a theme.

## How we built it
TypeScript, Preact, Three.js (models authored in Blender from code), zod, Vite; a Node 22 server with SQLite for
publishing, the webring and the guestbook; fast-check property tests, jsdom, Playwright. The renderer is one function
used for the live preview, publishing and export, so what you design is what visitors get.

## How Kiro was used (accurate to what happened)
- **Steering:** `product.md`, `tech.md`, `security.md` written before code and applied to every session.
- **Specs:** `site-core`, `editor`, `ghost`, `voice-capsule`, `room3d`, `web-atelier` (requirements, design, tasks).
- **Property-based tests:** privacy, XSS, determinism, round trips; mutation-checked in Task A/B (we broke the privacy
  filter on purpose and confirmed the tests fail, then reverted).
- **Hook:** one Stop hook that keeps the agent working until `tsc` passes.
- **Vibe sessions in Kiro Web** for the Web Atelier, demo homes, server, deploy package and this documentation.
- **Not used:** MCP servers, custom agents, powers beyond the defaults, the local Kiro IDE. `docs/KIRO_TASKS.md`
  lists the three tasks prepared for a local IDE run, still pending.
- What Kiro-assisted testing found: a service-worker cache that stored owner-only API responses and published
  pages (fixed, with a failing-then-passing test). Most other property tests found nothing, and we say so.
- Evidence: git history, `.kiro/`, `docs/kiro-log.md`, `docs/KIRO_TASKS.md`.

## Challenges
Making design freedom safe: widgets reference content by id, every CSS value comes from a validated enum or colour,
published pages run in a CSP sandbox, and the server re-validates what the editor produced. Keeping the draft
invisible until publish while the preview uses the real renderer. Making a Shanghai-hosted app load acceptably abroad
(Brotli took the app bundle from 4.5 MB to about 0.6 MB).

## What we are proud of
The three demo homes look like three different people; Close the Door; a test suite that fails when privacy is broken.

## Honest limits
Not tested on real phones or Safari; no user testing; not yet deployed from this repo; Figma not updated; Chinese text
not natively reviewed; the public 3D room ships inside the website ZIP rather than as a separate package; only four
starter styles.

## Built with
TypeScript, Preact, Three.js, Blender (Python), Vite, Node.js, SQLite, zod, fast-check, Playwright, Kiro.

## Links **[OWNER]**
Live app: https://little.quinnverse.tech (after deploy). Repo: https://github.com/Quinnverse/little-internet.
Video: (record per `docs/submission/DEMO_SCRIPT.md`; under 3 minutes).

## Submission checklist
- [ ] Rules re-read on the official page; deadline and eligibility confirmed **[OWNER]**
- [ ] PR #2 merged to the default branch (or the submitted branch is the one judges see) **[OWNER]**
- [ ] Repo public, MIT licence visible, `.kiro/` at the root and not in `.gitignore` (checked: not ignored)
- [ ] `截图合集.pdf` provenance checked or file removed (see docs/LICENSES.md) **[OWNER]**
- [ ] Deployed; `scripts/live-check.mjs` passes from outside China; demo homes seeded **[OWNER]**
- [ ] Real-device checklist done, results pasted into README status **[OWNER]**
- [ ] Video recorded from the real product, under 3 minutes, public link added **[OWNER]**
- [ ] Kiro write-up pasted from the section above; local IDE run of Tasks A/B/C recorded if possible **[OWNER]**
