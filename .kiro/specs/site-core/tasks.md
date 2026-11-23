# Tasks: Site Core

- [x] 1. Project scaffold and test setup
  - Configure vitest (`npm test` = single run), fast-check, jsdom; remove Vite demo files.
  - _Requirements: none (infrastructure)_

- [x] 2. Data model and validation
  - [x] 2.1 `schema.ts`: zod schemas, id/slug patterns, size presets, cross-reference checks
  - [x] 2.2 `normalize.ts`, `privacy.ts`
  - [x] 2.3 Arbitraries for valid Projects in `tests/arbitraries.ts`
  - _Requirements: 1.1–1.8, 6_

- [x] 3. Grid layout
  - [x] 3.1 `layout.ts` operations with collision push-down
  - [x] 3.2 PBT P5
  - _Requirements: 2.1–2.5_

- [x] 4. Escaping and URL safety
  - [x] 4.1 `escape.ts`, `video.ts`
  - [x] 4.2 Unit tests for known attack strings
  - _Requirements: 1.5, 1.6, 3.5_

- [x] 5. Static site generator and RSS
  - [x] 5.1 `themes.ts`, `generate.ts`, `rss.ts` (ghost.js as placeholder until ghost spec)
  - [x] 5.2 PBT P3, P6, P7
  - _Requirements: 3, 4_

- [x] 6. Site export / import
  - [x] 6.1 `exportZip.ts` + `zip.ts` with import limits
  - [x] 6.2 PBT P1, P4; unit tests for zip-slip, oversized, bad schema, missing image
  - _Requirements: 5, 6_

- [x] 7. Private backup
  - [x] 7.1 `backup.ts`
  - [x] 7.2 PBT P2; site export and backup cannot be swapped
  - _Requirements: 7_

- [x] 8. Independence check
  - `npm run check:export` unpacks a sample export onto disk, serves it with a bare static
    server from `/` and from `/@moon/`, crawls every reference, and checks all resolve.
  - _Requirements: 3.2–3.4_

## Open items for later specs
- `file://` behaviour of the ghost (Req 3.3) is verified in the ghost spec's browser test.
- Requirement 6.3 (no credentials) holds by construction: the schema has no such fields and
  zod strips unknown keys. Re-check when publishing/accounts are added.
