# Kiro hand-off: Tasks A / B / C

Status: **executed once in a Kiro Web session on 2026-11-24** (the session that wrote this file;
evidence below). **Not yet executed in Kiro IDE on a local machine** (`KIRO_EXECUTION_PENDING` for
the IDE run). Nothing here was run by another tool pretending to be Kiro.

- Repo: https://github.com/Quinnverse/little-internet
- Branch: `feat/web-atelier` (PR #2)
- Baseline commit before the tasks: `d85ed16`
- Read first: `.kiro/steering/{product,security,tech}.md`, `.kiro/specs/web-atelier/{requirements,design,tasks}.md`,
  `.kiro/specs/room3d/requirements.md` (Requirement 2, privacy), `.kiro/specs/site-core/design.md` (P1–P7)
- Hook present: `.kiro/hooks/typecheck-before-stop.json` (Stop → `npx tsc -p .`). Written in the
  `version: v1` hook format that the Kiro Web `createHook` tool documents (the tool call was interrupted, so the file was
  written by hand in that format). Not verified to load in Kiro IDE: open it once locally and confirm.

## Rules for the run
1. Do not break correct code to create evidence. If a property holds, say so.
2. Before trusting a new property, **mutate the code and watch the test fail**, then revert.
3. Every change goes through a commit; paste the commit SHA and the exact command output below.

## Task A: cross-view privacy invariant
Claim: when a public entry becomes private and the site is republished, it disappears from: its
page, RSS, `site.json`, the embedded room data (keepsakes, entry list), the ghost/Boo visitor guide,
and media files used only by it. On the server the old files are gone.

Code to read: `src/core/privacy.ts` (`publicProjection`), `src/core/generate.ts`,
`src/core/roomData.ts`, `server/index.ts` (PUT replaces the whole site directory).

Tests: `tests/cross-view.pbt.test.ts` (A1), `tests/server.test.ts` ("Task A (server)"),
`tests/web-privacy.pbt.test.ts` (W1, W2).

Run:
```bash
npx vitest --run tests/cross-view.pbt.test.ts tests/web-privacy.pbt.test.ts tests/server.test.ts
```
Mutation to try (then revert with `git checkout src/core/privacy.ts`): in `publicProjection`
replace `p.posts.filter((post) => post.visibility === 'public')` with `p.posts`. A1 must fail.

Pass = all green, and the mutation turns A1 red.

## Task B: design ↔ preview ↔ publish ↔ export consistency
Claim: the published design decides component order per page, spans, hidden-on-phone/desktop rules,
fonts and colours in `index.html`/`pages/*.html`/`style.css`/`site.json`; the Atelier preview uses the
same renderer; the draft never leaks while a snapshot exists; the server serves the ZIP bytes.

Code to read: `src/core/design.ts`, `src/core/generate.ts` (`siteRenderer`, `renderPreviewPage`),
`src/core/siteCss.ts`.

Tests: `tests/cross-view.pbt.test.ts` (B1–B4), `tests/server.test.ts` ("Task B (server)"),
browser: `npm run e2e:atelier` (checks 4–8, 14–15).

Mutation to try: in `chosenDesign` (`src/core/privacy.ts`) return `p.web.draft` always. B3 must fail.

## Task C: full backup and restore
Claim: restoring a private backup returns content ids, keepsake links, room layout, website draft
and published snapshot, media bytes and visibility; v1 saves migrate without making private photos
public.

Tests: `tests/portability.pbt.test.ts` (C1–C4), `tests/site-core.pbt.test.ts` (P2), browser:
`npm run e2e:atelier` (step 16, restore in a fresh browser).

## How to record real evidence (fill in; keep raw output)
| Item | Value |
|---|---|
| Kiro surface and version | |
| Date, start/end time | |
| Commands run and exit codes | paste output |
| Mutations tried and which tests failed | |
| Commits made (SHA + message) | |
| Anything Kiro found that was wrong | write "nothing" if nothing |
| Screens/logs saved to | `docs/kiro-evidence/` |

## Evidence from the Kiro Web session of 2026-11-24
- Tests added in this session: `tests/cross-view.pbt.test.ts` (5 tests), `tests/portability.pbt.test.ts`
  (4), two server tests, `tests/web-privacy.pbt.test.ts` (2, earlier).
- Mutation 1 (`publicProjection` keeps private entries): A1 failed. Mutation 2 (`chosenDesign` always
  draft): B3 failed. Both reverted; `git diff src/core/privacy.ts` empty afterwards.
- Bugs found by these tasks in product code: **none**. One false alarm in a new test (the word
  "Hello" also appears in a built-in UI string); fixed in the test, not in the product.
- Earlier in the same project (see `docs/kiro-log.md`): decisions and bugs from the 2025/26-11-23
  sessions. Hooks, MCP and custom agents were not used beyond the one hook above.
