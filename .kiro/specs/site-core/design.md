# Design: Site Core

## Modules (`src/core/`)

| Module | Responsibility |
|---|---|
| `schema.ts` | zod schemas and TS types for `Project`; `parseProject()` with cross-reference checks |
| `normalize.ts` | `normalize(project)`: canonical ordering (posts by `createdAt` desc then id, blocks by `y,x`, links by input order), trims text |
| `privacy.ts` | `publicProjection(project)` |
| `layout.ts` | `isValidLayout`, `placeBlock`, `moveBlock`, `resizeBlock`, `removeBlock` |
| `escape.ts` | `escapeHtml`, `escapeAttr`, `escapeXml`, `jsonForScript`, `safeHttpUrl` |
| `video.ts` | `parseVideoUrl(url) → VideoEmbed | null`, `embedSrc(embed)` |
| `generate.ts` | `generateSite(project, opts) → Map<path, Uint8Array>` (calls `publicProjection` itself) |
| `rss.ts` | `generateFeed(publicProject, baseUrl?)` |
| `themes.ts` | the 3 theme CSS variable sets |
| `exportZip.ts` | `exportSite(project) → Uint8Array`, `importSite(bytes) → Result<Project>` |
| `backup.ts` | `createBackup(project) → Uint8Array`, `restoreBackup(bytes) → Result<Project>` |

`generateSite` is the only code path that produces website files. Publishing uploads its
output; exporting zips it.

## Data model (schemaVersion 1)

```ts
type Project = {
  schemaVersion: 1;
  site: { slug: string; title: string; tagline: string; theme: 'paper' | 'midnight' | 'room' };
  ghost: { enabled: boolean; name: string; color: 'white' | 'mint' | 'peach' | 'lilac' };
  blocks: Block[];
  posts: Post[];
  links: Link[];             // friend links
  webring: { prev?: string; next?: string; random?: string; hub?: string };
  assets: Asset[];
};
type Block = { id: string; x: number; y: number; w: 1|2|4; h: 1|2;
  content: { kind: 'post'; postId: string } | { kind: 'image'; assetId: string }
         | { kind: 'text'; text: string } | { kind: 'links' } | { kind: 'ghost-home' }
         | { kind: 'latest' } };
type Post = { id; slug; title; body; createdAt /* ISO */; visibility: 'public'|'private';
  imageIds: string[]; video?: { provider: 'youtube'|'vimeo'; videoId: string } };
type Link = { id; title; url };
type Asset = { id; mime; ext; data: Uint8Array };
```

Size presets: `(w,h) ∈ {(1,1),(2,1),(2,2),(4,1),(4,2)}`.

**Public projection**: drop private posts; drop blocks pointing to dropped posts; drop
assets not referenced by any public post or remaining block.

## Export layout

```
index.html
posts/<slug>.html
style.css
ghost.js
feed.xml
site.json          # public projection, assets as {id, mime, path} (no binary)
assets/<id>.<ext>
```

Backup format: a ZIP named `*.littleinternet-backup.zip` containing `backup.json`
(`{ kind: 'little-internet-backup', project }`, assets as paths) and `assets/`. It has no
`index.html`, so it cannot be mistaken for a deployable site.

## Generated HTML

- CSP: `default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self';
  frame-src https://www.youtube-nocookie.com https://player.vimeo.com; base-uri 'none'; form-action 'none'`.
- Ghost data is embedded as `<script type="application/json" id="ghost-data">` using
  `jsonForScript` (escapes `<`, `>`, `&`, U+2028, U+2029). `ghost.js` reads it; no inline JS.
- Grid: CSS grid with 4 equal columns, square rows, container `max-width: 720px`.
  `style.css` is generated per site and contains one rule per block
  (`.b-<id> { grid-column: …; grid-row: … }`). There are no inline `style` attributes, so
  the CSP needs no `'unsafe-inline'`. All ids match `^[a-z0-9_-]{1,40}$`, so they are safe
  in class names, file names, and CSS selectors without escaping.

## Correctness properties (fast-check)

| # | Property | Validates |
|---|---|---|
| P1 | For any valid Project `p`: `importSite(exportSite(p)) == normalize(publicProjection(p))` | 5.2 |
| P2 | For any valid Project `p`: `restoreBackup(createBackup(p)) == normalize(p)` | 7.2 |
| P3 | For any valid Project with arbitrary text (including `<script>`, quotes, `</script>`, `]]>`, U+2028): no generated HTML file contains an element, attribute, or URL scheme that did not come from the template | 3.5, 3.6 |
| P4 | For any valid Project: every private post's title/body/slug is absent from every exported file (using marker strings) and every private-only asset is absent | 6.1, 6.2 |
| P5 | For any valid layout and any sequence of place/move/resize/remove operations: the result is valid and contains exactly the expected block ids | 2.3–2.5 |
| P6 | For any valid Project: every `href`/`src` in generated files is relative, or an allowed external URL from user data | 3.2, 3.4 |
| P7 | For any valid Project: `generateSite(p)` called twice yields identical bytes | 3.7 |

P3 is checked by parsing generated HTML with jsdom and comparing the set of element tag
names, attribute names, and `<script>` elements against an allow-list.

## Error handling

`importSite` and `restoreBackup` return `{ ok: true, value: Project } | { ok: false, reason }`.
Both go through `zip.ts#readProjectZip`, which reads entry names first, rejects unsafe
paths, then decompresses only the manifest, then only the assets the manifest references.
They never throw on malformed input.
