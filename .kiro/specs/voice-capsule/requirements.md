# Requirements: Voice Time Capsule

## Introduction

An answering machine in the owner's room. The owner leaves recordings of their own voice
for whoever visits, now or later. Real recordings only — no synthesis. Each recording is
private or public like a diary entry, and public ones travel with the exported site as
plain audio files.

## Requirements

### Requirement 1: Data
1. A Project SHALL hold up to 20 recordings, each with: id, title, creation time,
   visibility (`public` | `private`), duration (1 ms – 60 s), audio MIME type
   (`audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`), audio bytes (≤ 5 MB), and an
   optional "open on" date (YYYY-MM-DD).
2. Projects saved before this feature (no `recordings` field) SHALL still load, as
   having no recordings.
3. A room block of kind `voice` (the answering machine) SHALL exist.

### Requirement 2: Privacy
1. A new recording SHALL be private until the owner explicitly makes it public.
2. Private recordings SHALL never appear in any published or exported file; they SHALL be
   included in the private backup.

### Requirement 3: Recording and choosing files (editor)
1. THE owner SHALL be able to record in the browser with the microphone; recording SHALL
   stop automatically at 60 seconds and show elapsed time.
2. THE owner SHALL be able to choose an existing audio file instead (for devices without a
   microphone); files over 60 seconds or 5 MB, or of other types, SHALL be refused with a
   reason.
3. WHEN microphone access is refused or unavailable, THE editor SHALL say so and offer the
   file option.
4. THE owner SHALL be able to play, rename, set an "open on" label, make public/private,
   and delete each recording.
5. THE editor SHALL state that the "open on" date is a label, not a lock.

### Requirement 4: In the published site
1. THE answering machine block SHALL list public recordings, newest first, each with
   title, date, optional "open on" label, and a native `<audio controls>` player that
   loads only when played.
2. WITH no public recordings, the block SHALL say there are no messages yet.
3. Audio files SHALL be referenced relatively and work on any static host.
4. THE page CSP SHALL allow media from `'self'` only.
5. WHEN there are public recordings, the ghost's guide SHALL include a link to them.
