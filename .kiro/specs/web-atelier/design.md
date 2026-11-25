# Design: Web Atelier

## Modules
- `src/core/design.ts` — schemas (SiteDesign, SitePage, SiteWidget, ThemeTokens, DecorationAsset,
  WebsiteButton, WebState), starter styles, v1 migration, `publicDesign`.
- `src/core/designOps.ts` — pure design operations (add/move/remove widget, pages, tokens,
  decorations, badge). The editor wraps them in `design(op)` commands; the store validates.
- `src/core/generate.ts` — one renderer for site pages, posts and the Atelier preview
  (`renderPreviewPage`: same HTML, CSS inlined, no scripts, blob URLs for media).
- `src/core/siteCss.ts` — tokens → CSS variables, patterns as fixed inline SVG/gradients, a CSS
  grid with N columns on wide screens and 2 on phones. No absolute positioning.
- `src/core/pixels.ts` — original 16×16 pixel stickers rendered as SVG rects.
- `src/runtime/site.js` — guestbook (live only on `/@slug/` of the publishing host) and badge code.
- `src/editor/ui/atelier/*` — editor UI; `Neighbourhood.tsx` — CRT menu, door, walk, Move My Home.
- `server/index.ts` — publish, door, webring directory and redirects, guestbook.
- `src/demo/*` — demo homes, PNG encoder, seeding through the publish API.

## Draft vs published
`publicProjection(p, which)` keeps exactly one design (published by default), drops hidden widgets
and private references, and ships only images that public entries, that design, or friend badges
use. The draft is never part of a published or exported file once a snapshot exists.

## Security
- CSS values come only from validated colours, enums, bounded integers and ids.
- User text is escaped; JSON in scripts uses `jsonForScript`; runtime uses `textContent` only.
- Published pages: `Content-Security-Policy: sandbox allow-scripts …` (no `allow-same-origin`),
  so a published page cannot read the editor's IndexedDB or keys.
- Uploads are decoded on the device and re-encoded (GIF ≤ 2 MB kept); the server checks image
  magic bytes and the public-only `site.json`.
- No arbitrary HTML, JavaScript or iframes in V1 (video embeds stay limited to YouTube/Vimeo ids).
