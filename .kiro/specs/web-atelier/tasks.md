# Tasks: Web Atelier

- [x] 1. Design model + schemaVersion 2 migration (Req 1) — `tests/site-core.test.ts`
- [x] 2. Renderer, CSS, pixel stickers, site.js (Req 1.6, 3.3) — P3, P4, P6, P7
- [x] 3. Editor: library, preview, inspector, styles, pages, undo/redo, phone drawer (Req 2) — e2e
- [x] 4. Draft vs published, publish dialog, privacy republish (Req 3) — E5, W1, W2, e2e step 13
- [x] 5. Server: validation, sandbox, door, webring (Req 3.5, 4) — `tests/server.test.ts`
- [x] 6. Badge editor, Internet Walk, Move My Home (Req 4.4, 5) — e2e steps 14–16
- [x] 7. Demo homes, Try a demo, seeding (Req 6) — `tests/demo.test.ts`, e2e step 17
- [ ] 8. Pixel World and Midnight Garden starter styles (deferred)
- [ ] 9. Standalone public-3D-home export package (deferred; stated in Move My Home)
- [ ] 10. KIRO_EXECUTION_PENDING: run Task A/B/C below inside Kiro and record the real session

## Tasks for Kiro (not yet run in Kiro)
- **Task A (cross-view privacy):** make a public entry with a keepsake, publish, make it private;
  extend W1/W2 or `tests/room.pbt.test.ts` until room data, page, RSS, Boo index and media all
  provably drop it; fix any failure found.
- **Task B (design ↔ export):** property: for random designs, widget order, spans, tokens and
  references in `site.json` and `style.css` equal the published design.
- **Task C (portability):** property: restoreBackup(createBackup(p)) keeps content ids, keepsake
  links, room layout, website draft + snapshot and visibility (P2 covers equality; add a
  migration-from-v1 variant).

## Verified (this branch)
- `npm test`: unit + property tests, including W1, W2, E5, server door/webring.
- `npm run e2e:atelier`: 34 checks in headless Chromium.

## Not verified
- Real iPhone/Android devices, Safari, real users, production deployment, Figma.
