# Tasks: Home (3D room)

- [x] 1. Steering and spec updated (product.md, security.md, this spec)
- [x] 2. Core: room schema, rules, privacy projection, storage, commands, properties R1-R3 (+ R4 via determinism P7)
- [x] 3. i18n (en/zh) and site language
- [x] 4. room3d: procedural room, furniture, pet, camera, picking, light; screenshot check
- [x] 5. Home UI: HUD, object → feature routing, journal list, simple (no-3D) view
- [x] 6. Memory → object in EntrySheet; decorate mode with undo
- [x] 7. Visitor runtime (door, bell, greeting, welcome play, public objects) in export
- [x] 8. Backend: publish, serve, guestbook with moderation
- [x] 9. 3D models: 59 Blender models reviewed, 42 shipped as the kit (Hunyuan3D-2 pipeline kept, not shipped)
- [x] 10. e2e on phone/tablet/desktop (56 checks), README, kiro-log

## Verified
- `npm test`: 89 tests (properties R1-R3, P1-P7, E1-E4, G1-G4, server).
- `npm run e2e`: 62/62 in headless Chromium.

## Not verified
- Real devices, Safari, native Chinese review, public deployment.
