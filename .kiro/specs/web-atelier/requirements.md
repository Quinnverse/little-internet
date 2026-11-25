# Requirements: Web Atelier (free website decoration), neighbourhood, portability

## Introduction

The owner builds their own website, not a template choice. A visual editor arranges components
on a responsive grid, styles every part of the page, and publishes a snapshot that visitors see.
The same renderer powers the editor preview, publishing and the ZIP export. Demo homes and the
webring prove that independent, very different sites can link to each other.

## Requirements

### Requirement 1: Data model (schemaVersion 2)
1. A Project SHALL hold `web`: a `draft` SiteDesign, an optional `published` snapshot
   `{ design, at }`, and a guestbook snapshot of approved notes.
2. A SiteDesign SHALL hold ThemeTokens, 1–8 SitePages, up to 120 SiteWidgets, DecorationAssets,
   a WebsiteButton and an optional rendered 88×31 badge.
3. Each SiteWidget SHALL have an id, type, page id, order, responsive layout (span 1–4, phone
   full/half/hide, desktop show/hide, align), style (look, optional colours, tilt), content and a
   hidden flag.
4. Widgets SHALL reference content by id (posts, the welcome recording, links, memory objects).
   Diary text SHALL NOT be copied into the design.
5. A schemaVersion 1 save SHALL migrate: blocks become widgets in reading order, the theme becomes
   the closest starter style; a block that showed a diary photo becomes a reference to its entry.
6. Every colour SHALL be `#rrggbb`, every font/pattern/border an enum, so no owner value can break
   out of CSS.

### Requirement 2: Editor
1. Clicking the CRT SHALL offer Visit my website and Decorate my website; a dock button SHALL open
   the Atelier without the 3D room.
2. Desktop: component library (left), live preview (centre), inspector (right), top bar with
   undo, redo, desktop/phone preview, save draft, visitor preview and publish.
3. Phone/tablet (< 900px): full-screen preview with a bottom drawer (Add, Style, Pages, Edit,
   Site); the top bar SHALL fit a 375px screen.
4. The owner SHALL add, remove, duplicate, hide, reorder (drag or arrows), resize and move
   components between pages, and edit background colour, tiled pattern, background image, fonts,
   colours, borders, corners, shadow, dividers, stickers, GIFs, favicon, site name, welcome banner.
5. Undo/redo SHALL cover every design change; quick edits of one field merge into one step.
6. Starter styles (Retro Internet, Scrapbook, Literary Journal, Blank Canvas) SHALL be editable
   starting points; restyling SHALL keep the components unless the owner asks to replace them.
7. Removing a component SHALL NOT delete any entry, photo or recording.

### Requirement 3: Publishing and privacy
1. Changing the draft SHALL NOT change what visitors see until the owner publishes.
2. Publishing and export SHALL build the published design (the draft only before a first publish).
3. Hidden widgets and references to private entries SHALL never be published or exported
   (property W1, W2).
4. When an entry, recording or keepsake stops being public, the editor SHALL republish so the live
   page, RSS, room data and post URLs follow.
5. The server SHALL accept only a valid, public-only `site.json`, real image files, and SHALL serve
   published pages in a CSP sandbox without access to the editor origin.

### Requirement 4: Guestbook, door, webring, badges
1. Live guestbook: visitors sign, notes stay pending until approved; exports show the approved
   snapshot read-only with a note that new notes need the live site.
2. Close the Door SHALL delete the published copy on the server, stop the guestbook, remove the
   home from the webring, and say that copies already downloaded cannot be recalled.
3. The owner SHALL join or leave the webring; Prev/Next/Random SHALL redirect between real
   published homes that joined and whose door is open, with no ranking.
4. The badge editor SHALL produce a real 88×31 PNG and copyable HTML. Saving a neighbour's badge
   is one-way and grants no access.

### Requirement 5: Portability
1. Move My Home SHALL offer: My Website (ZIP), My Public Home (honestly described as part of the
   website ZIP), Everything I Own (private backup with a warning).
2. The exported website SHALL keep its decoration on any static host and make no request to the
   platform.
3. Restoring a backup SHALL bring back the website draft, published snapshot and every id.

### Requirement 6: Demo homes
1. Three demo homes SHALL be built with the same model, commands and publish API, marked as demos,
   with original art, visibly different designs, and linked by the webring.
2. Try a demo home SHALL create a private copy at a different address that cannot overwrite the
   public demo.
