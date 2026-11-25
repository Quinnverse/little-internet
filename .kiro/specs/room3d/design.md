# Design: Home (3D room)

## Layers
- `src/core/room.ts` (pure): constants (kinds, slots, palettes, reserved cells), `RoomSchema`,
  placement rules, `autoSlot`, `publicRoom`. No DOM.
- `src/room3d/` (browser, Three.js): `build.ts` builds a room `Group` from room data + a
  `RoomView` controller (orbit-ish camera, picking, focus tweens, pet, light). Shared by the
  editor and the visitor runtime.
- `src/runtime/room-entry.ts`: visitor runtime (door → room → entries). Built to
  `src/runtime/room.bundle.js` (committed), shipped in every export as `room.js`.
- `src/editor/ui/`: HUD, sheets (existing EntrySheet, VoiceSheet, Door, Settings reused).
- `server/`: Node http + `node:sqlite`.

## Data
`room` and `site.lang` are additive with zod defaults, so `schemaVersion` stays 1 (see tech.md).
Fixed built-in furniture (desk + diary, computer, answering machine side table, shelf, window,
door, bed for the pet) sits at fixed cells; decorate changes skin and decor, and moves memory
objects between named slots (`shelf-1..6`, `desk-1..3`, `wall-1..4`, `sill-1..2`).

## Visitor data
`generateSite` embeds `<script type="application/json" id="room-data">` with the public room
only: skin, decor, public memory objects (kind, slot, title, href), welcome audio path and
duration, ghost, site title, language. Same `jsonForScript` escaping. CSP is unchanged except
`connect-src 'self'` (guestbook on the platform copy only).

## GLB props
`scripts/assets/` pipeline: reference image → Hunyuan3D-2 Space `/shape_generation` (white
mesh) → `@gltf-transform` weld + simplify + quantize → `assets/models/<kind>.glb` →
`scripts/pack-models.mjs` writes `src/room3d/models.generated.ts` (base64). The loader uses
`GLTFLoader.parse`, so no network fetch is needed in exports.

## Backend
`POST /api/publish/:slug` (body: ZIP, `Authorization: Bearer <key>`), `GET /@slug/*`,
`POST /api/sites/:slug/messages`, `GET .../messages` (owner), `POST .../messages/:id/approve|delete`,
`GET .../messages/approved`.

## Correctness properties
- R1: for any project, every room placement is valid after any command sequence.
- R2: no private post's text/media appears in any export through room/memory data.
- R3: old saves without `room`/`lang` load with defaults; round trips preserve room data.
- R4: export is deterministic with room data.
