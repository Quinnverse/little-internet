# Requirements: Mobile Editor

## Introduction

The editor is the creator's side of Little Internet: a mobile-first web app (PWA) where
the owner sets up their home, writes private-by-default diary entries, adds photos,
arranges the room on the grid, previews the real generated site, and downloads either the
public website or the private backup. It builds on the `site-core` spec and never
re-implements its rules. Publishing to a hosted URL, the ghost's behaviour, and the voice
time capsule are separate specs.

## Glossary

- **Room**: the homepage grid as the owner arranges it.
- **Diary**: the list of posts.
- **Door**: the screen where the owner decides what is public and takes files away.
- **Command**: a pure function `Project → Project` that the UI calls to change data.

## Requirements

### Requirement 1: First run

**User story:** As a new owner, I want to have my own space within a minute, without an
account.

1. WHEN no project is stored on the device, THE editor SHALL show a short setup: home name,
   address (slug, suggested from the name), theme, ghost name and colour.
2. THE setup SHALL create a valid Project whose room already contains a ghost home, a
   latest-entries block, and a friends block, so the first screen is never empty.
3. THE setup SHALL NOT require an account, email, or network access.
4. THE editor SHALL offer "restore from backup" and "import a site" from the first screen.

### Requirement 2: Local persistence

**User story:** As an owner, I want my work saved automatically on my phone.

1. THE editor SHALL save the Project to IndexedDB after every change (debounced ≤ 500 ms).
2. WHEN the editor starts, THE editor SHALL load the stored Project and validate it with
   the site-core schema; WHEN validation fails, THE editor SHALL keep the stored data
   untouched and offer to download it raw instead of overwriting it.
3. THE editor SHALL request persistent storage, and the Door screen SHALL explain that
   browsers can clear local data and that the private backup is the safeguard.

### Requirement 3: Commands keep data valid

**User story:** As an owner, I never want an action to corrupt my home.

1. EVERY data change SHALL go through a command; the editor SHALL validate the result with
   the site-core schema and SHALL reject (keep the old Project and show the reason) any
   result that is invalid.
2. Deleting a post SHALL remove blocks that show it. Deleting a post or block SHALL remove
   images no longer used by anything.

### Requirement 4: Diary (private by default)

**User story:** As an owner, I want to write without performing for anyone.

1. A new entry SHALL be private unless the owner explicitly makes it public.
2. An entry SHALL have a title, a body, up to 12 photos, and an optional YouTube/Vimeo
   link; an unsupported link SHALL be rejected with a clear message.
3. Photos SHALL be resized on the device to at most 1600 px on the long edge and
   re-encoded as JPEG (GIFs under 2 MB are kept as-is) before being stored.
4. Each entry SHALL show its visibility clearly, and changing it SHALL be one tap.
5. Post URL slugs SHALL be generated automatically and stay unique.

### Requirement 5: Room editing

**User story:** As an owner on a phone, I want to arrange my room with taps.

1. THE room SHALL be shown as the 4-column grid, scaled to the screen width.
2. Tapping a block SHALL select it; with a block selected the owner can move it (tap the
   target cell), resize it (preset sizes only), edit it, or remove it.
3. THE owner SHALL be able to add: an entry block, a photo block, a text note, latest
   entries, friends, and the ghost home. New blocks go to the first free spot.
4. Blocks showing private entries SHALL be visibly marked as hidden from visitors.

### Requirement 6: Preview is the real site

**User story:** As an owner, I want to see exactly what visitors will see.

1. THE preview SHALL display the output of `generateSite` for the current Project, served
   from the same origin through a service worker, with no second renderer.
2. THE preview SHALL show only public content (because it is the generated site).

### Requirement 7: The Door — files to take away

**User story:** As an owner, I want to take my home with me.

1. THE Door SHALL show how many entries and photos are public vs. private.
2. "Download website" SHALL call `exportSite` and save `<slug>-site.zip`, and SHALL state
   that it contains public content only.
3. "Download private backup" SHALL call `createBackup`, save
   `<slug>.littleinternet-backup.zip`, and SHALL warn that it contains private entries
   and must not be uploaded to a website.
4. "Import a site" and "Restore backup" SHALL show what will be replaced and ask for
   confirmation before replacing the current Project; failures SHALL show the reason
   from site-core.
5. THE Door SHALL let the owner edit friend links and webring links; invalid URLs SHALL
   be rejected with a message.

### Requirement 8: Settings

1. THE owner SHALL be able to change home name, tagline, address, theme, ghost name,
   ghost colour, and turn the ghost off.

### Requirement 9: Mobile quality

1. Every interactive control SHALL have a touch target of at least 44×44 CSS px and an
   accessible name.
2. THE editor SHALL work in current mobile Safari and Chrome, portrait, from 360 px wide.
3. THE editor SHALL be installable as a PWA (manifest + icons) and SHALL load offline
   after the first visit.
