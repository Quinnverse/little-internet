# Acceptance matrix — Web Atelier (branch `feat/web-atelier`)

Evidence = what actually ran. "e2e" = `npm run e2e:atelier` (headless Chromium, real server, real
static host). Device emulation is not a real-device test.

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1 | Click the CRT in the 3D room | PASS | e2e: hotspot `computer` → CRT menu |
| 2 | Enter my website | PASS | CRT "Visit my website" (opens live site or preview) |
| 3 | Open Web Atelier | PASS | e2e "Web Atelier opens from the CRT" |
| 4 | Change background and font | PASS | e2e computed `background-color`, heading `font-family` |
| 5 | Add Guestbook | PASS | e2e "three components added" |
| 6 | Add Diary and Boo | PASS | same; diary shows public entry only |
| 7 | Move a component | PASS | e2e order check after two "Move up" |
| 8 | Phone preview | PASS | e2e 370px frame, 0px overflow |
| 9 | Save draft | PASS | draft autosaved in IndexedDB; backup restore proves layout persisted |
| 10 | Publish to its own address | PASS | e2e `/@pixel-harbor/` |
| 11 | Another device visits | PARTIAL | second browser context at 390px; no real second device |
| 12 | Same content as home / journal | PASS | same entries; one data source (E5) |
| 13 | Privacy change updates all views | PASS | e2e page, RSS, post URL 404; W1/W2 |
| 14 | Export HTML | PASS | e2e ZIP contents, no private text |
| 15 | Offline / other host keeps decoration | PASS | e2e static host, platform requests blocked: 0 |
| 16 | Restore backup restores layout | PASS | e2e fresh browser, 15/15 widgets |
| 17 | Webring to a differently styled site | PASS | e2e Midnight → Book Nook, different bg + font |
| – | Close the Door | PASS (server) | `tests/server.test.ts`; UI not in e2e yet |
| – | Demo homes, Try a demo | PASS | `tests/demo.test.ts`, e2e demo copy on phone |
| – | Real devices / Safari | NOT_TESTED | |
| – | Real users | NOT_TESTED | |
| – | Production deploy | NOT_TESTED | no change made to any server |
| – | Kiro execution | KIRO_EXECUTION_PENDING | tasks in `.kiro/specs/web-atelier/tasks.md` |
| – | Figma | NOT UPDATED | no Figma write access in this environment |
