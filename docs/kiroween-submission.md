# Kiroween 2026 submission package — Resurrection

Source of truth for rules: <https://kiroween.devpost.com/> and
<https://kiroween.devpost.com/rules>. Checked 2026-11-23; re-check before
submitting, as rules can change.

## 1. Official requirements (verified from the live page)

- **Deadline:** Fri **2026-12-04, 2:00 PM Pacific / 11:00 PM GMT+1**.
- **Eligibility:** only **new** projects built during the Submission Period
  (**Oct 30 – Dec 4, 2026**). Little Internet's commits are in this window.
- **Category:** Resurrection — "bring your favorite dead technology back to
  life." Our angle: resurrect the personal home page of the early web as a
  modern, private, portable PWA. Prize: Best Resurrection $5,000.
- **Submit:** public **GitHub** repo with all source/assets/instructions, a
  detectable open-source **license** (MIT ✓), the **`.kiro/`** directory at root
  and NOT gitignored (✓), a URL to the working app, a text description, a
  **<3 minute public YouTube demo** showing the app on its target device, and a
  write-up on how Kiro was used.
- **Kiro write-up topics** (judges look for effective, varied use): Kiro surface,
  custom agents, hooks, spec-driven development, steering docs, MCP, PBT, powers.
  We honestly cover the ones actually used (steering, spec-driven, PBT) and state
  the rest were not used — see `docs/kiro-writeup.md`.
- **Judging:** Potential Impact, Technological Implementation, Design,
  Innovation/Idea, Presentation.
- **Teams** up to 3. Bonus prizes (Best Startup, Best Student, Social Blitz,
  Bonus Blog, Best Demo) each have extra requirements — see the official page.

## 2. Owner actions still required before submission

These cannot be done by the build agent (need owner accounts/credentials):

| # | Action | Why |
|---|--------|-----|
| 1 | Deploy to a public host and get a working app URL | Devpost requires "URL to your working app"; production deploy not performed (`PRODUCTION_DEPLOYED = NO`) |
| 2 | Record and publish a <3 min YouTube demo | Required; script + shot list below |
| 3 | Create the Devpost account/team and submit before the deadline | Owner account |
| 4 | (Optional) LinkedIn + startup site for Best Startup; student proof for Best Student | Bonus prize requirements |
| 5 | (Optional) Social post with `#KiroweenHackathon26` at the start / blog post | Bonus prizes |
| 6 | Re-read the official rules page on submission day | Rules may change |

## 3. Repo-side checklist (all satisfied in this build)

- [x] Public GitHub repo `Quinnverse/little-internet`
- [x] MIT `LICENSE` at root, detectable by GitHub
- [x] `.kiro/` at root with specs + steering, not gitignored
- [x] Full English `README.md` with features, architecture, Kiro usage, run/build/test, status
- [x] Kiro write-up (`docs/kiro-writeup.md`) and `.kiro/` guide (`docs/kiro-directory.md`)
- [x] Architecture diagram (`docs/architecture.md`)
- [x] 3-minute demo script + shot list (below)
- [x] Privacy audit (`docs/privacy-audit.md`)
- [x] Trial materials (`docs/user-testing/`)
- [x] Deployment package (`compose.yaml`, `deploy/`), `PRODUCTION_DEPLOYED = NO`
- [x] Tests re-run: 102 unit/PBT + 49 + 12 E2E, all passing

## 4. Devpost text drafts (copy/edit into the form)

### Title

**Little Internet — Your corner of the internet, yours to keep**

### Short description (elevator pitch)

> Little Internet resurrects the personal home page for the modern web. On your
> phone, build a small home, keep a private diary and voice notes, adopt a little
> ghost, then publish only what you choose to a shareable `/@username/` URL — or
> download the entire site and host it anywhere, forever. Private by default,
> personal by design, portable by nature.

### Description (features & functionality)

> The early web had a radical idea: everyone could have a home page that was
> actually theirs. Social platforms took that away. Little Internet brings it
> back as a privacy-first PWA.
>
> - Build a home on a snap grid with a cozy "Room" skin; works on phone, tablet
>   and desktop, installable offline.
> - Write a diary where every entry is private until you open its door; leave
>   yourself voice messages in an answering machine.
> - A small ghost greets visitors and can guide them to your public pages; an
>   owner-only ghost searches your private memories on-device.
> - Choose exactly what is public, publish to a stable URL, update it, or
>   unpublish it instantly (the origin returns 410 and caches cannot resurrect it).
> - Export a public-only static ZIP that runs on any host with no platform
>   dependency — the ghost, content and recordings keep working. A separate
>   encrypted-by-intent private backup keeps your drafts off the website.
>
> There are no accounts, no tracking and no server-side private data: your
> device is the source of truth.

### What makes it a Resurrection

> It revives the lost art of the self-hosted personal site, but rebuilt for
> today: offline-first PWA, strict privacy boundaries, property-based testing
> over hostile inputs, and a publish pipeline that guarantees the online site
> is byte-for-byte the same artifact as the portable export.

### How Kiro was used (summary — point to `docs/kiro-writeup.md`)

> Kiro Web (Vibe mode) with three always-on steering documents kept a multi-session
> build on-scope and privacy-safe. Four specs (requirements → design → tasks with
> named correctness properties) drove implementation. Property-based testing with
> fast-check caught a real XSS-class bug in the ghost link allow-list. Real-browser
> E2E and screenshot review caught a dark-theme contrast issue and a 7px mobile
> overflow. No hooks/MCP/Crew were used; we state that plainly.

### Demo video URL

`[OWNER: paste public YouTube URL here]`

### Working app URL

`[OWNER: paste deployed URL, e.g. https://little.quinnverse.tech/]`

## 5. Three-minute demo script (timed)

Total ≈ 2:50, leaving buffer under the 3:00 hard limit.

| Time | Section | Narration (EN) | On screen |
|------|---------|----------------|-----------|
| 0:00–0:20 | 1. Why resurrect | "The personal home page died when social feeds took over. Little Internet brings it back — a small, private corner of the web that's actually yours." | Old-style home page → app icon on phone home screen |
| 0:20–0:50 | 2. Create space | "On my phone I create a home in seconds. No account, no email." | Setup: name home → Move in → Room appears |
| 0:50–1:20 | 3. Ghost + records | "I write a note — it's private by default. I leave myself a voice message. My little ghost remembers my entries, privately, on this device." | New private entry; record in answering machine; talk to owner ghost |
| 1:20–1:50 | 4. Choose & publish | "I open one entry's door to make it public, then publish. I pick a short address and get a link." | Door → set public → Publish my corner → live URL appears |
| 1:50–2:10 | 5. Visitor view | "In a private window, the visitor sees only what I chose — my private diary and photos are gone." | Incognito loads `/@username/`; ghost greets; private note absent |
| 2:10–2:40 | 6. Portability | "Now I download the website ZIP and host it on another static server. The ghost, the entries, the recording — all still work. No platform needed." | Download ZIP → unzip → serve elsewhere → visitor site works |
| 2:40–2:55 | 7. Tech evidence | "Under the hood: one core renderer powers preview, export and publish; property-based tests fuzz hostile inputs; the publish service reuses that exact renderer." | Repo: `.kiro/specs`, `src/core/generate.ts`, tests passing |
| 2:55–3:00 | Close | "Little Internet — private by default, personal by design, portable by nature." | Title card + GitHub repo URL |

## 6. Shot list for the video

- [ ] S1 Phone home screen with installed app icon (real device if available)
- [ ] S2 Setup → name → Move in → Room
- [ ] S3 Diary: create a private entry (show the "Private" badge)
- [ ] S4 Answering machine: record + playback
- [ ] S5 Owner ghost search finds the private entry (on-device)
- [ ] S6 Toggle one entry to Public; Door panel shows public/private counts
- [ ] S7 Publish → result link with `/@username/`
- [ ] S8 Fresh incognito tab loads published site; ghost animates; guide bubble
- [ ] S9 Split/compare: public entry visible, private entry NOT visible
- [ ] S10 Download website ZIP; unzip; serve from a plain static server
- [ ] S11 Published site on the second host still shows ghost + audio
- [ ] S12 Repo shots: `.kiro/` tree, a spec, `generate.ts`, `npm test` passing
- [ ] S13 Title card: name, one-line pitch, GitHub URL

Recording tips: 1080p, portrait phone footage composited into a landscape frame
for S1–S9; avoid copyrighted music; captions on; keep each shot 3–8s.

## 7. Pre-submission checklist (run on submission day)

- [ ] Re-read official rules + deadline (timezone!)
- [ ] `git rev-parse HEAD` matches pushed origin/main or intended branch
- [ ] `npm test` (expect 102 passed), `npm run typecheck`, `npm run build`
- [ ] `npm run e2e` (49/49) and `npm run e2e:publish` (12/12) still pass
- [ ] Repo is public; LICENSE visible in GitHub About; `.kiro/` tracked
- [ ] App URL loads; publish/unpublish verified on the deployed instance
- [ ] YouTube demo is public, <3:00, no third-party copyrighted material
- [ ] Devpost form: category Resurrection, repo URL, app URL, description, Kiro write-up, video URL
- [ ] Owner-only bonus items filled if pursuing them (startup/student/social/blog)
- [ ] Save draft early; submit before 2026-12-04 14:00 PT
