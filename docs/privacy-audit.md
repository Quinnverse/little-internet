# Privacy & data-safety audit

Principle: **Private by default · Personal by design · Portable by nature.**
Competition scope has exactly two visibility states — Private (owner's device only)
and Public (explicitly published). Friends-only is out of scope.

This document maps each required check to where it is enforced and how it was
verified. "Verified" means an automated test actually ran (see results below),
not a code-reading claim.

| # | Requirement | Enforcement | Verification |
|---|-------------|-------------|--------------|
| 1 | Private diaries never in public HTML | `publicProjection()` in `src/core/privacy.ts` drops non-public posts before `generateSite`; the same generator makes preview/export/publish | `publish-privacy.pbt.test.ts` (property, 120 runs), `publish.test.ts`, original P4 |
| 2 | Private photos never in public asset dir | projection drops assets used only by private posts/blocks; generator emits only public asset paths | PBT asserts `assets/<private>` absent; `publish.test.ts` (404 for privphoto.png) |
| 3 | Private recordings never in public ZIP | projection filters non-public recordings before `toStored` | PBT asserts `audio/<private>` absent; E2E "export contains only the public recording" |
| 4 | Private content never in RSS | `generateFeed` receives only the projected public project and re-filters visibility | `publish.test.ts` feed.xml assertion; PBT text scan |
| 5 | Visitor ghost cannot read private knowledge base | `ghostData()` uses only public posts/recordings; `ghost.js` allow-lists hrefs; owner memories live in `src/editor/memories.ts`, never in `generateSite` | ghost PBT G1–G4; privacy PBT scans generated HTML for private markers |
| 6 | Public/private backups strictly separate | `exportSite()` (public) and `createBackup()` (full, private) are separate functions/formats; no shared include-private flag | `export-independence.test.ts`; E2E export vs backup behaviour |
| 7 | After unpublish, new published versions omit removed content | flipping a post to private removes its page in the next `generateSite`; unpublish removes the dir and returns 410 | PBT "flipping a post to private drops its page"; `publish.test.ts` unpublish→410; publish E2E →410 |
| 8 | Public site contains no local DB, credentials or private metadata | generator writes only known files; site.json is the public projection; token hash lives in server `data/meta`, never in site files | `publish.test.ts` (site.json has no token/hash); PBT scans for token-like fields |
| 9 | URLs, filenames, titles, diary bodies cannot XSS | zod `isCanonicalHttpUrl`/`isSafeText`, `escapeHtml`/`escapeXml`/`jsonForScript`, strict CSP meta + response CSP, fixed safe filenames | site-core P3 (jsdom allow-list), publish PBT (no inline handlers / no executable schemes), `publish.test.ts` XSS case |
| 10 | Publish service never leaks other users' sites | per-username dirs, ownership hash check on update/unpublish, strict media-key set, no cross-user reads | `publish.test.ts` unauthorized update/unpublish 403, smuggled media rejected, path traversal 404 |

## Browser cache / Service Worker / stale artifacts

- Published-site responses: `Cache-Control: no-store, max-age=0, must-revalidate`,
  plus ETag. No long-lived origin cache to invalidate on unpublish.
- Editor Service Worker (`public/sw.js`) originally had scope `./` and a
  network-first shell cache. When editor and `/@username/` share an origin, that
  cache could resurrect an unpublished site offline. **Fixed:** the SW now
  returns early (no `respondWith`) for `/@*`, `/api/*` and `/healthz`, so those
  requests always hit the network. Verified by publish E2E (unpublish → 410 in a
  fresh browser context) and by code-level reasoning documented in kiro-log.
- Preview cache (`li-preview`) holds only `generateSite(project)` output, i.e.
  the public projection; it cannot contain private diary content. It is keyed by
  exact URLs and pruned on each preview update.
- Old generated artifacts: the publish store keeps recent previous versions only
  in `data/trash` (not served), garbage-collected after 7 days or >5 versions.

## What cannot be guaranteed

- Once a visitor has downloaded files, or a search engine/archive/RSS reader has
  cached a page, unpublishing this platform cannot recall those copies. This is
  disclosed in the editor UI and the one-page trial instructions.
- A browser-local publish credential is not a cross-device account. Losing the
  browser data means losing the ability to update/unpublish (re-publish under a
  new address is possible). This is disclosed in the UI.

## Test results for this build (all actually run, 2026-11-23)

- `npm test`: 102 passed / 0 failed.
- `npm run e2e`: 49/49 checks passed (real Google Chrome, mobile/tablet/desktop).
- `npm run e2e:publish`: 12/12 checks passed (real Google Chrome, 375/768/1440).
- Manual HTTP against the real server binary: health → publish → public/private
  isolation → private media 404 → unpublish → 410.

No item above is based on the pre-existing test report; all suites were re-run
from source in this build.
