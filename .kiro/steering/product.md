---
inclusion: always
---

# Product: Little Internet

**Tagline:** A quiet corner of the internet, just for you.
**Principle:** Private by default. Personal by design. Portable by nature.

A private little home on the internet. The owner writes a diary, keeps photos, decorates
the room, and lives alongside a small ghost. Nothing needs to perform for anyone. When the
owner chooses to open the door, the public part becomes an independent personal website
that can be exported and kept running without our platform. The owner can leave recordings
of their own voice in the house (voice time capsule) for whoever visits, now or after
they are gone.

Hackathon category: **Resurrection** — reviving the GeoCities-era personal homepage and
the answering machine, reimagined as a private home rather than a profile to impress.
Death is part of the theme, not a contradiction: the ghost keeps the house warm, and the
owner's real voice stays in it.

## Privacy defaults

- Every new post and recording is **private** by default. Making something public is an
  explicit owner action, every time.
- Private content lives only on the device (IndexedDB) and in the private backup. It is
  never sent to any server or API.

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
2. Mobile creation (snap-grid editor, private-by-default posts, photos)
3. Ghost (website companion component, including local "memories")
4. Voice time capsule (answering-machine block)
5. Themes (exactly 3; one is the "room" skin)
6. Friend links / webring (static links only; already in the generator)

The guestbook is removed; the voice time capsule took its slot.
Rule: a new feature may only enter by **replacing** one of equal cost.

## Voice time capsule

- An answering-machine block in the room. The owner records their own voice in the
  browser (MediaRecorder), up to 60 seconds per recording, a few recordings total.
- Each recording is public or private like a post. Public recordings ship in the export as
  plain audio files and play with a native `<audio>` element; private ones exist only in
  the private backup.
- Real recordings only. No voice synthesis or cloning, ever.
- No accounts, verification, or "memorial mode". The owner simply leaves recordings.
- An optional "open on" date may only be shown as a label. A static site cannot really
  lock a file, so the UI must not claim it is locked.

## Room skin

The "room" is a visual theme over the same grid, not a new system: post blocks look like
a diary on a desk, image blocks like picture frames, link blocks like a bookshelf, the
voice block like an answering machine. Same data, same export.

## Frozen scope — do NOT add

Garden, pet growth stats, economies, follows, comments, notifications, visitor counters,
guestbook, custom domains (roadmap only), LLM/cloud AI features, voice synthesis/cloning,
memorial/inheritance modes, inactivity-triggered behaviour, avatar characters,
multiple rooms, free-form (non-grid) layout, video upload, user-authored HTML/CSS/JS.

## The ghost is a component, not a system

Exactly four states, driven by local rules only (no LLM, no backend):
- **Idle** — wanders on the homepage
- **Sleep** — after inactivity
- **React** — to newly published content
- **Guide** — points visitors to posts, photos, friend links, voice recordings

The ghost has two audiences with strictly separated data:
- **Owner view (editor):** may use private posts for local "memories": *on this day*
  (an entry from a past year) and *last time you wrote about X* (local keyword search),
  always showing which entry it came from. Never invents content. No network.
- **Visitor view (exported site):** uses public content only. Private data never reaches
  `ghost.js` or the ghost JSON in a generated page.

## Mobile editing interaction

Bottom toolbar; tap a block to select; tap an empty cell to place; preset sizes
(1×1, 2×1, 2×2, 4×1, 4×2); a separate panel for editing content. No pinch-zoom,
no free drag-resize.

## Honesty rules for the submission

- Demo sites used for webring "random" must be labelled as sample sites.
- External embeds (YouTube/Vimeo) and outbound links are not guaranteed to keep working
  after export; say so in the UI and docs.
- Never describe something in the video that is not a running feature.
