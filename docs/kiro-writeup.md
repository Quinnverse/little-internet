# How we used Kiro — evidence-based write-up

This write-up describes what actually happened during the build. It is derived
from `docs/kiro-log.md` (raw session notes) and the committed repository. Where
a Kiro feature was not used, we say so rather than inventing a story.

## Which Kiro surface

We used **Kiro Web in Vibe mode** as the primary assistant. We did not run Kiro
IDE, CLI, Kiro Crew, custom agents, hooks, MCP servers or Kiro powers in this
build. Those were conscious scope choices for a time-boxed hackathon; the
write-up below therefore focuses on steering, spec-driven development and
property-based testing, which is where the real leverage was.

## 1. Steering first

Before writing code we created three steering files (`.kiro/steering/`):

- `product.md` — froze the scope and the single acceptance chain, and set the
  priority order (privacy and portability first). When the owner later changed
  "phone-only" to "phone + tablet + desktop", we updated the steering doc first,
  so every subsequent session inherited the new rule instead of re-litigating it.
- `tech.md` — established the pure-TS core (`src/core/`, no DOM), explicit `.ts`
  import extensions, relative-only URLs in generated sites, and the rule that
  every universal requirement gets a property test.
- `security.md` — defined trust boundaries (all typed text and imported ZIPs are
  untrusted), the output-encoding rules, the URL/video allow-lists, and the
  single most important privacy rule: everything published is derived from the
  public projection.

The biggest effect of steering was scope control: across many sessions, no
garden/farm/pet-simulation/AI-voice-cloning/social feature crept in, and no
private data path was added without a projection check.

## 2. Spec-driven development

We wrote four specs under `.kiro/specs/`, each with `requirements.md` (EARS-style
statements), `design.md` (with named correctness properties) and `tasks.md`:

| Spec | Properties | Outcome |
|------|-----------|---------|
| `site-core` | P1–P7 (round-trip, backup, no markup injection, private never exported, layout validity, relative refs, determinism) | implemented in one session |
| `editor` | E1–E4 | pure command layer validated by the same zod schema as import |
| `ghost` | G1–G4 | visitor ghost + on-device owner memories |
| `voice-capsule` | (absorbed into P1/P2/P4/P6/P7) | schema change was additive with a zod default |

Spec-driven development changed the process compared with pure vibe coding:
requirements were stated as testable invariants first, so implementation and
tests were designed together. When the voice feature was added, its correctness
properties were folded into the existing site-core properties rather than
bolted on — the generators simply started including recordings.

## 3. Property-based testing (PBT)

We used `fast-check` to generate thousands of hostile inputs. Representative
generators mix normal text with attack strings: `</script>`, `"><svg onload=…>`,
`]]>`, U+2028/U+2029, `javascript:` and duplicate ids.

**A real bug PBT caught:** property G1 produced the href `" JAVASCRIPT:x"` for
the ghost guide. `ghost.js` originally checked the scheme only at position 0;
browsers strip leading whitespace/control characters, so the link could have
executed script. We replaced the check with a strict href allow-list and made
the test resolve hrefs the way a browser does. Defence in depth: the core schema
never emits such data, but `ghost.js` ships inside exported sites hosted on
other people's domains.

**Two harness bugs PBT exposed** (honest note): early `fast-check` runs passed
suspiciously fast because default sizes kept command sequences at 0–6 steps
(raised to `size: 'max'`, 10–40 steps), and a `fc.subarray` length mistake. These
were test bugs, not product bugs — but finding them made us trust the properties
more.

In the R1 publish work we added PBT that asserts, for any valid project: private
posts/recordings/photos never appear in generated files (120 runs), generated
HTML never contains inline event handlers or executable URL schemes (80 runs),
artifacts contain no credential-like fields and never register a service worker
(60 runs), and flipping a post to private removes its page from the next
generation.

## 4. Screenshots / E2E review complementing unit tests

Some problems only surfaced when we looked at rendered output in a real browser:

- Opening a sheet from the dark "Midnight" room produced light text on a light
  sheet. Fixed; an E2E assertion now checks computed colours.
- A 7px horizontal scroll on phones appeared only while the ghost bubble was
  open. The cause was a `transform` (which does not affect scroll width); the
  fix used `left`/`right`, and E2E lists overflowing elements to catch regressions.
- Headless Chromium rendered emoji as blank boxes, so icons were moved to inline
  SVG — which also helped users without emoji fonts.

## 5. Bugs found and fixed in the R1 publish work (recorded, not hypothetical)

1. Username regex was built from `SITE_SLUG_PATTERN.toString()`, embedding the
   `/.../` delimiters and rejecting every valid name — fixed by using the RegExp
   object directly.
2. Oversized requests destroyed the socket, so clients got a connection reset
   instead of a clean HTTP 413 — fixed by draining the stream and returning 413.
3. The editor service worker could cover `/@username/` on a shared origin and
   resurrect an unpublished site from its shell cache — fixed by excluding
   published-site and API paths from the SW entirely.
4. The publish UI kept showing "Unpublish" after unpublishing (state derived from
   localStorage with no re-render) — fixed with explicit state; E2E verifies.
5. CORS preflight returned 404 for a cross-origin editor during E2E — added an
   optional, off-by-default `corsOrigin` to the publish service.

## 6. How Kiro influenced technical decisions

- Keep the core pure and framework-free so the same renderer serves preview,
  export and online publish — this is what makes "publish artifact == export ZIP"
  provable rather than assumed.
- Treat imported/published data as hostile and validate at every boundary with
  the same zod schema.
- Separate public export from private backup at the function level, so a single
  flag cannot leak drafts.
- Prefer additive schema changes with zod defaults and a compatibility test.

## Limitations / what we did not do

No Kiro hooks, custom agents, MCP, Crew or Kiro powers were used, so this project
does not demonstrate those features. Playwright's browser download stalled in the
environment; E2E was driven through the locally installed Google Chrome channel.
No physical device testing was performed (see the device checklist, NOT TESTED).
