# Little Internet: 3D model review

Made in Blender 5.0 (bpy) by `assets/blender/build_props.py`, rendered with Cycles (CPU). Models are low-poly,
rounded, and use one shared palette. Nothing here is wired into the web app yet: it waits for your review.

## Where to look

| What | Where |
|---|---|
| Assembled scenes (day, night, villa, exterior, desk close-up) | `scenes/*.png` |
| One contact sheet per category | `sheets/*.jpg` |
| Each model, 3/4 view | `renders/<name>.jpg` |
| The models themselves (glTF binary, metres, Y up, origin at the bottom centre) | `glb/<name>.glb` |
| Assembled room and exterior as single models | `glb/room_cabin.glb`, `glb/room_villa.glb`, `glb/exterior_cabin.glb`, `glb/exterior_villa.glb` |
| Numbers for every model | `manifest.json` and the table below |

**59 models**, 57,492 triangles in total, 2,348 KB of glb before any compression.

## Conventions the web app will rely on

- 1 unit = 1 m. Room floor is x 0..6, z 0..6, floor top at y = 0. x right, y up, z toward the viewer.
- Room walls are separate nodes `wall_back`, `wall_left`, `wall_front`, `wall_right`, with real window and door openings,
  so the app can fade whichever wall faces the camera. The door leaf hangs from the empty `door_pivot` (rotate it to open).
- Hotspot anchors are empties named `hs_*`: `hs_computer`, `hs_diary`, `hs_voice`, `hs_shelf`, `hs_window`, `hs_door`,
  `hs_doorbell`, `hs_mailbox`, `hs_export` (the CD), `hs_photo_wall`, `hs_record_player`, `hs_pet`, `hs_desk`.
- The computer screen material is `screen`. Lit things use materials named `emissive_*` so the app can dim them by day.
- Budgets: props < 2,000 triangles, furniture < 5,000, buildings < 15,000. The table flags anything over.

## Models

| Model | Category | Triangles | KB | Budget |
|---|---|---:|---:|---|
| `bookshelf` | furniture | 2,064 | 131 | ok |
| `coffee_table` | furniture | 844 | 17 | ok |
| `desk` | furniture | 916 | 45 | ok |
| `dresser` | furniture | 1,388 | 47 | ok |
| `office_chair` | furniture | 1,308 | 54 | ok |
| `side_table` | furniture | 476 | 14 | ok |
| `answering_machine` | functional | 708 | 32 | ok |
| `books_row` | functional | 972 | 54 | ok |
| `books_stack` | functional | 864 | 49 | ok |
| `calendar` | functional | 836 | 58 | ok |
| `cd_disc` | functional | 396 | 14 | ok |
| `computer` | functional | 496 | 24 | ok |
| `desk_lamp` | functional | 312 | 9 | ok |
| `diary` | functional | 428 | 22 | ok |
| `doorbell` | functional | 292 | 13 | ok |
| `house_door` | functional | 484 | 22 | ok |
| `keyboard_mouse` | functional | 868 | 69 | ok |
| `mailbox` | functional | 416 | 22 | ok |
| `microphone` | functional | 956 | 18 | ok |
| `nameplate` | functional | 352 | 16 | ok |
| `pen_cup` | functional | 552 | 12 | ok |
| `photo_album_open` | functional | 1,400 | 47 | ok |
| `photo_wall` | functional | 1,644 | 85 | ok |
| `polaroid_camera` | functional | 648 | 32 | ok |
| `record_player` | functional | 864 | 31 | ok |
| `rotary_phone` | functional | 1,136 | 43 | ok |
| `storage_box` | functional | 772 | 26 | ok |
| `typewriter` | functional | 1,452 | 54 | ok |
| `cake` | ambient | 1,324 | 28 | ok |
| `floor_cushion` | ambient | 172 | 5 | ok |
| `floor_lamp` | ambient | 312 | 9 | ok |
| `lava_lamp` | ambient | 596 | 13 | ok |
| `mug` | ambient | 708 | 16 | ok |
| `pet_bed` | ambient | 476 | 10 | ok |
| `plant_small` | ambient | 744 | 16 | ok |
| `printer` | ambient | 412 | 21 | ok |
| `radio` | ambient | 504 | 25 | ok |
| `rug` | ambient | 276 | 6 | ok |
| `stickers` | ambient | 492 | 23 | ok |
| `wall_clock` | ambient | 736 | 29 | ok |
| `armchair` | decor | 908 | 37 | ok |
| `basket` | decor | 556 | 12 | ok |
| `cactus` | decor | 872 | 18 | ok |
| `mini_bookcase` | decor | 840 | 54 | ok |
| `plant` | decor | 984 | 21 | ok |
| `stool` | decor | 368 | 7 | ok |
| `keepsake_book` | keepsake | 324 | 19 | ok |
| `keepsake_candle` | keepsake | 264 | 7 | ok |
| `keepsake_cassette` | keepsake | 316 | 13 | ok |
| `keepsake_flower_vase` | keepsake | 608 | 13 | ok |
| `keepsake_photo_frame` | keepsake | 120 | 8 | ok |
| `keepsake_postcard` | keepsake | 156 | 12 | ok |
| `keepsake_shell` | keepsake | 944 | 53 | ok |
| `keepsake_ticket` | keepsake | 168 | 13 | ok |
| `pet_ghost` | pet | 1,088 | 29 | ok |
| `cabin_exterior` | house | 6,280 | 214 | ok |
| `cabin_room_shell` | house | 2,892 | 156 | ok |
| `villa_exterior` | house | 6,516 | 228 | ok |
| `villa_room_shell` | house | 2,692 | 147 | ok |

## Scenes

| Scene | Triangles |
|---|---:|
| `desk_corner` | 16,860 |
| `exterior_cabin_day` | 6,280 |
| `exterior_villa_night` | 6,516 |
| `room_cabin_day` | 30,552 |
| `room_cabin_night` | 30,552 |
| `room_villa_day` | 30,352 |

## Known gaps (honest list)

- Ambient occlusion is **not** baked into vertex colours yet. These renders are Cycles-lit; the web app will light the same models in real time and will look flatter.
- The pet's three clips (`idle`, `move`, `sleep`) are node animations (bob, lean, squash, blink). There is no skeleton, which is enough for a rounded ghost.
- Shapes are built from code (rounded boxes, cylinders, spheres). Organic things (leaves, shell, ghost) are simple and toy-like, not sculpted.
- SketchUp was not used (no Linux build in the sandbox); the white-box layout was done in Blender.
- The glb files are uncompressed. See the size summary in the chat for what compression would save.
