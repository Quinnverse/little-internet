# Requirements: Home (3D room), memory objects, visitor entrance

## Introduction

The home becomes the main interface. A single 3D room with a pet. Objects are entry points to
real features. One data model feeds the room, the journal sheets and the public website.

## Requirements

### Requirement 1: Data (additive, old saves still load)
1. A Project SHALL hold a `room`: house style (`cabin` | `villa`), wall colour id, floor id,
   light mode (`auto` | `day` | `night`), up to 12 decor items (kind, integer cell x,z in a
   6×6 floor, rotation 0–3), up to 40 memory objects (kind, post id, slot id), and an optional
   welcome recording id.
2. Site settings SHALL hold a language (`en` | `zh`).
3. Projects saved before this feature SHALL load with defaults for `room` and `lang`.
4. Decor items SHALL stay inside the floor, SHALL NOT sit on reserved cells (built-in
   furniture) and SHALL NOT overlap each other. A memory slot SHALL hold at most one object.
   Every memory object SHALL reference an existing post. The welcome id SHALL reference an
   existing recording.

### Requirement 2: Privacy
1. A memory object SHALL be shown to visitors only if its post is public.
2. The welcome recording SHALL be used by visitors only if it is public.
3. Decor, wall, floor, house and light are public (they carry no personal text).
4. No file produced by publishing or export SHALL contain a private post's title, body,
   or media because of a memory object (property test, marker strings).

### Requirement 3: Home view (owner)
1. THE app SHALL open on the 3D room, full screen, with the pet inside.
2. THE owner SHALL rotate the view 360° (drag), zoom (pinch / wheel), and recentre.
3. Tapping an object SHALL open its feature: diary → write/list entries; computer → the
   website view and publishing; answering machine → voice sheet; pet → pet sheet; shelf/
   memory objects → that entry; window → light mode; door → visitor preview.
4. THE UI SHALL be a small floating HUD, not tab pages. A journal list SHALL remain reachable
   for fast writing and reading.
5. WHEN WebGL is unavailable or the user prefers low power, THE app SHALL show an
   illustrated list of the same objects instead (no feature is lost).
6. prefers-reduced-motion SHALL disable camera swoops and idle animation.

### Requirement 4: Memory → object
1. WHEN saving an entry THE owner MAY choose an object kind or none. The default is none.
2. THE object SHALL be placed in the first free slot suitable for its kind; the owner can move
   it to another free slot in decorate mode.
3. Deleting an entry SHALL remove its object. Changing visibility SHALL update the public
   projection accordingly.

### Requirement 5: Decorate
1. THE owner SHALL choose house style, wall, floor and light mode, and add, move (cell
   selection), rotate and remove decor items. Invalid placements SHALL be refused with a
   reason.
2. Every change SHALL be undoable at least one step (undo button).

### Requirement 6: Visitor entrance (published site)
1. THE published page SHALL show the house door first. A doorbell tap opens the door, the pet
   greets, and the visitor enters the room.
2. THE welcome recording SHALL never autoplay. A play button SHALL appear at the answering
   machine.
3. Visitors SHALL see only public objects; tapping one opens the public entry page.
4. A "skip to website" control SHALL always be present. WITHOUT JavaScript or WebGL the page
   SHALL remain the normal static site.
5. The runtime SHALL be a same-origin file in the export (no CDN, no platform URL) and SHALL
   work under `/` and `/@slug/`.

### Requirement 7: Languages
1. THE UI SHALL switch between English and Chinese at runtime and remember the choice.
2. THE generated site SHALL use the owner's site language for fixed labels.

### Requirement 8: Backend
1. THE server SHALL accept a published ZIP for a slug, claim the slug for the first publisher's
   key, and serve it at `/@slug/`.
2. A visitor SHALL leave a text message; it SHALL be pending until the owner approves it.
3. Only approved messages SHALL be public. Limits and rate limits SHALL apply.
4. THE client SHALL send only the public-projection export ZIP and never the private data.

### Requirement 9: 3D assets
1. Procedural furniture SHALL always work. AI-generated props (Hunyuan3D-2, build-time) MAY
   replace the look of a kind; a failed load SHALL fall back to procedural.
2. Generated props SHALL be simplified to a small triangle budget and embedded in the runtime.
