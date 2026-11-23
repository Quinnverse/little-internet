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
