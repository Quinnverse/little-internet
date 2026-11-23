---
inclusion: always
---

# Tech conventions

## Stack
- Vite + TypeScript (strict), PWA target, mobile-first.
- `zod` for validating data at trust boundaries (import, storage load).
- `fflate` for ZIP export/import.
- Tests: `vitest` + `fast-check` (property-based). Run with `npm test` (single run, never watch).

## Layout
- `src/core/` — pure, framework-free TypeScript. No DOM access. This is where the
  data model, layout rules, static site generator, RSS, and ZIP export/import live.
  Everything here must be unit- and property-testable in Node.
- `src/runtime/` — vanilla JS shipped *inside exported sites* (e.g. the ghost). Must not
  import from the editor or reference platform URLs.
- `src/editor/` — the mobile editor UI.
- `tests/` — `*.test.ts` (examples) and `*.pbt.test.ts` (properties).

## Rules
- Import local modules with explicit `.ts` extensions.
- Generated sites use **relative URLs only** for their own files. No absolute paths,
  no CDN, no platform domain. A generated site must work under `/`, under `/@slug/`,
  and from any static host.
- `site.json` schema is versioned (`schemaVersion`). Breaking changes (renamed/removed
  fields, changed meaning) require a version bump and an import migration. Purely
  additive fields are allowed without a bump only if they have a zod `.default(...)`, so
  older files still load (example: `recordings`), and a test proves an old file loads.
- Every requirement with a universal statement ("for any site…") gets a property test.
- Prefer small pure functions; the editor calls core functions instead of re-implementing rules.
