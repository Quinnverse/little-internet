# Requirements: Site Core

## Introduction

The site core is the framework-free part of Little Internet that turns a user's project
into an independent static website, and back. It owns the data model, the grid layout
rules, the static site generator, RSS, the site export ZIP, re-import, and the private
backup. The editor UI and the ghost runtime are separate specs that build on this one.

This spec protects the product's single acceptance chain:
**Edit → Publish → Export → Run independently → Re-import.**

## Glossary

- **Project**: everything the creator has, including private drafts.
- **Public projection**: the Project with private posts, and assets referenced only by
  private posts, removed.
- **Site export**: a ZIP generated from the public projection, meant for deployment.
- **Private backup**: a file containing the full Project, meant to stay with the user.
- **Block**: a module placed on the homepage grid.

## Requirements

### Requirement 1: Project data model

**User story:** As a creator, I want my site stored in a well-defined, versioned format,
so that it can be saved, exported, and imported without loss.

1. THE system SHALL represent a Project with: `schemaVersion`, site settings (slug, title,
   tagline, theme), ghost settings, homepage blocks, posts, friend links, webring links,
   and image assets.
2. THE slug SHALL match `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`.
3. THE theme SHALL be one of exactly three theme ids.
4. EACH post SHALL have a unique id, a unique URL slug, a title, a plain-text body,
   a creation time, a visibility of `public` or `private`, zero or more image references,
   and an optional video embed.
5. A video embed SHALL be stored as `{ provider: "youtube" | "vimeo", videoId }` with a
   provider-specific id pattern, never as a raw URL.
6. EACH friend link and webring link SHALL use an `http:` or `https:` URL with no
   embedded credentials.
7. EACH image asset SHALL have a unique id, a MIME type of `image/jpeg`, `image/png`,
   `image/webp`, or `image/gif`, and binary content.
8. ALL references (block → post/asset, post → asset) SHALL resolve to existing items.

### Requirement 2: Grid layout

**User story:** As a creator on a phone, I want blocks to snap into a simple grid, so that
my homepage always looks tidy on any screen.

1. THE grid SHALL have exactly 4 columns and an unbounded number of rows.
2. A block size SHALL be one of 1×1, 2×1, 2×2, 4×1, 4×2 (width × height).
3. A layout SHALL be valid only if every block satisfies `0 ≤ x`, `x + w ≤ 4`, `0 ≤ y`,
   and no two blocks share a cell.
4. WHEN a block is placed, moved, or resized, THE system SHALL return a valid layout,
   moving other blocks down to resolve collisions, and SHALL keep every block.
5. WHEN a block is removed, THE system SHALL return a valid layout without that block.
6. THE rendered grid SHALL scale with screen width (max width on large screens) and
   SHALL NOT reorder or reflow blocks.

### Requirement 3: Static site generation

**User story:** As a creator, I want my site turned into normal web files, so that anyone
can visit it in a browser without an app or account.

1. THE generator SHALL produce, from the public projection only: `index.html`, one page
   per public post under `posts/`, `style.css`, `feed.xml`, `ghost.js`, image files under
   `assets/`, and `site.json`.
2. EVERY reference from a generated file to another generated file SHALL be a relative URL.
3. THE generated site SHALL work when served from a domain root, from a sub-path such as
   `/@moon/`, and when opened from the local filesystem (except the ghost's optional
   features that browsers block on `file://`, which SHALL fail silently).
4. THE generated site SHALL NOT reference any platform-owned URL or third-party CDN.
   The only external references allowed are user friend/webring links and video embeds
   from `www.youtube-nocookie.com` or `player.vimeo.com`.
5. ALL user-provided text SHALL be escaped for its output context (HTML text,
   HTML attribute, XML, JSON in script).
6. EACH HTML page SHALL include a Content Security Policy meta tag that disallows inline
   scripts and restricts frames to the two allowed video hosts.
7. THE generator SHALL be deterministic: the same Project SHALL produce byte-identical files.

### Requirement 4: RSS

**User story:** As a visitor, I want to subscribe to someone's site in any feed reader.

1. `feed.xml` SHALL be valid RSS 2.0 containing only public posts, newest first.
2. EACH item link SHALL point to the post's page. Because RSS readers need absolute
   links, THE generator SHALL accept an optional base URL; WHEN none is given, item links
   SHALL be relative and the export UI SHALL say feeds need a base URL to work in readers.

### Requirement 5: Site export and re-import

**User story:** As a creator, I want to download my whole site and later continue editing
it, so that it never depends on this platform.

1. THE site export SHALL be a ZIP of exactly the generator's output.
2. WHEN a site export is imported, THE system SHALL reconstruct a Project equal to the
   normalized public projection of the exported Project.
3. Import SHALL reject files over 50 MB, ZIPs with more than 2,000 entries, entry paths
   that are absolute or contain `..`, and `site.json` that fails schema validation, with
   a human-readable reason.
4. Import SHALL ignore unknown fields and SHALL only read assets referenced by `site.json`.

### Requirement 6: Privacy

**User story:** As a creator, I want my private drafts to never leak, so that I can write
freely.

1. NO file in a site export SHALL contain the title, body, or slug of any private post.
2. NO site export SHALL contain an asset referenced only by private posts.
3. NO site export or backup SHALL contain credentials, tokens, or account data.

### Requirement 7: Private backup

**User story:** As a creator, I want a backup of everything, including drafts, because my
browser may clear local storage.

1. THE private backup SHALL contain the full Project, including private posts and their
   assets.
2. WHEN a private backup is restored, THE system SHALL reconstruct a Project equal to the
   normalized original.
3. THE private backup SHALL be produced by a different function from the site export, and
   its file name and format SHALL make clear that it is not a website.
