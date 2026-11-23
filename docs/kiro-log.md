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
