---
inclusion: always
---

# Product: Little Internet

**Tagline:** Your corner of the internet. Yours to keep.

A mobile-first personal website creator. A user arranges a homepage on a snap grid,
records life (text, photos, links, video embeds), adopts a small website ghost, links
to other personal sites, publishes, and can export the whole site as static files that
run on any static host without our platform.

Hackathon category: **Resurrection** — reviving the GeoCities-era personal homepage
(guestbook-era web, webrings, friend links, a little life inside the page) with today's
tools: mobile-first editing, static generation, portable formats.

## Product form (decided)

- The **creator** is a mobile-first Web App, installable as a PWA. Installing is a
  convenience for creators, never a requirement for visitors.
- What users publish is an **independent static website**, not an app. Visitors open it
  in any browser, on phone or desktop, with no account and no install.
- Online publishing and ZIP export use **the same static site generator**. There is no
  second rendering path.
- Publish address for the hackathon: path form, `<host>/@<slug>/`. No subdomains,
  no custom domains.
- Editor preview loads the same `ghost.js` runtime that ships in exported sites.

## Two files, never confused

- **Site export ZIP**: public projection only. Meant to be deployed. Contains HTML, CSS,
  RSS, assets, ghost runtime, and a public `site.json` for re-import.
- **Private backup**: full project including private drafts. Meant to stay with the user
  (drafts live in IndexedDB, which browsers can clear). Never deployed, never published.
  The UI must make this difference obvious.

## Grid contract

Fixed 4-column grid. Phones fill the width; desktop centres the grid at a max width
(~720px). Layout **scales, it never reflows** — one layout, every screen.

## The one acceptance chain (must never break)

**Edit → Publish → Export → Run independently → Re-import**

Any change that risks this chain is lower priority than keeping it working.

## Priority order (when time runs short, cut from the bottom)

1. Site ownership and export (static HTML/CSS/RSS/site.json, fully self-contained)
2. Mobile creation (snap-grid editor, posts, photos)
3. Ghost (website companion component)
4. Themes (exactly 3)
5. Webring / friend links (static links only)
6. Guestbook (optional; may be skipped entirely)

## Frozen scope — do NOT add

Garden, pet growth stats, economies, follows, comments, notifications, visitor counters,
custom domains (roadmap only), AI/LLM features, free-form (non-grid) layout, video upload,
user-authored HTML/CSS/JS.

## The ghost is a component, not a system

Exactly four states, driven by local rules only (no LLM, no backend):
- **Idle** — wanders on the homepage
- **Sleep** — after inactivity
- **React** — to newly published content
- **Guide** — points visitors to posts, photos, friend links

## Mobile editing interaction

Bottom toolbar; tap a block to select; tap an empty cell to place; preset sizes
(1×1, 2×1, 2×2, 4×1, 4×2); a separate panel for editing content. No pinch-zoom,
no free drag-resize.

## Honesty rules for the submission

- Demo sites used for webring "random" must be labelled as sample sites.
- External embeds (YouTube/Vimeo) and outbound links are not guaranteed to keep working
  after export; say so in the UI and docs.
- Never describe something in the video that is not a running feature.
