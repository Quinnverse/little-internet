---
inclusion: always
---

# Security and privacy rules

## Trust boundaries
- Everything a user types, and every imported ZIP/site.json, is untrusted.
- Imported data is parsed with the zod schema; unknown fields are dropped; cross-references
  (ids, slugs, layout) are re-validated. Never trust a ZIP's declared sizes alone.

## Output encoding
- All text goes through `escapeHtml` (HTML) or `escapeXml` (RSS). No exceptions, no raw HTML.
- Data embedded in `<script type="application/json">` goes through `jsonForScript`.
- URLs: only `http:`/`https:` for user links, no embedded credentials. Video is stored as
  `{provider, videoId}` (validated id), never as a raw URL, and embedded only from
  `www.youtube-nocookie.com` or `player.vimeo.com`.
- Generated pages carry a restrictive CSP meta tag as defense in depth.
- Users cannot author HTML, CSS, or JS.

## Privacy
- Posts have `visibility: public | private`.
- Anything published or exported (HTML, RSS, `site.json`, assets) is derived from the
  **public projection** of the site. Private posts and assets referenced only by private
  posts must never appear in any exported file.
- No credentials, tokens, or account data ever go into `site.json`.
- The private backup file is the only artifact allowed to contain private posts. It is
  produced by a separate function from the site export, and the two code paths must
  not share an "include private" flag that could be flipped by mistake.
