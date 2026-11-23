# Tasks: Site Core

- [ ] 1. Project scaffold and test setup
  - Configure vitest (`npm test` = single run), fast-check, jsdom; remove Vite demo files.
  - _Requirements: none (infrastructure)_

- [ ] 2. Data model and validation
  - [ ] 2.1 `schema.ts`: zod schemas, id/slug patterns, size presets, cross-reference checks
  - [ ] 2.2 `normalize.ts`, `privacy.ts`
  - [ ] 2.3 Arbitraries for valid Projects in `tests/arbitraries.ts`
  - _Requirements: 1.1–1.8, 6_

- [ ] 3. Grid layout
  - [ ] 3.1 `layout.ts` operations with collision push-down
  - [ ] 3.2 PBT P5
  - _Requirements: 2.1–2.5_

- [ ] 4. Escaping and URL safety
  - [ ] 4.1 `escape.ts`, `video.ts`
  - [ ] 4.2 Unit tests for known attack strings
  - _Requirements: 1.5, 1.6, 3.5_

- [ ] 5. Static site generator and RSS
  - [ ] 5.1 `themes.ts`, `generate.ts`, `rss.ts` (ghost.js as placeholder until ghost spec)
  - [ ] 5.2 PBT P3, P6, P7
  - _Requirements: 3, 4_

- [ ] 6. Site export / import
  - [ ] 6.1 `exportZip.ts` with import limits
  - [ ] 6.2 PBT P1, P4; unit tests for zip-slip, oversized, bad schema
  - _Requirements: 5, 6_

- [ ] 7. Private backup
  - [ ] 7.1 `backup.ts`
  - [ ] 7.2 PBT P2
  - _Requirements: 7_

- [ ] 8. Independence check
  - Script `npm run check:export` that exports a sample project, serves it from a
    sub-path with a plain static server, and verifies every relative reference resolves.
  - _Requirements: 3.2–3.4_
