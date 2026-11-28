# Licences and asset provenance

Checked 2026-11-24 from `node_modules/*/package.json` (versions in `package-lock.json`). This is an engineering
check, not legal advice.

## Project
MIT (`LICENSE`, "Copyright (c) 2026 Quinnverse"). OSI-approved.

## Shipped in the app or in published sites (runtime)
| Package | Version | Licence |
|---|---|---|
| three | 0.187.0 | MIT |
| preact | 11.2.0 | MIT |
| zod | 4.6.7 | MIT |
| fflate | 0.8.3 | MIT |

## Development and test only (not shipped)
vite 8.3.8 (MIT), typescript 7.0.2 (Apache-2.0), vitest 5.1.1 (MIT), fast-check 4.11.0 (MIT),
playwright 1.65.1 (Apache-2.0), jsdom 31.0.1 (MIT), @gltf-transform/* and meshoptimizer (MIT, asset pipeline only).
Run `npm ls --all` for transitive packages; a full SBOM scan has **not** been run.

## Assets
| Asset | Source | Licence / status |
|---|---|---|
| 3D models in `assets/models/` (42 shipped, 59 reviewed in `assets/review/`) | Written by the project in Blender Python (`assets/blender/build_props.py`) | Original work, MIT with the repo |
| Pixel stickers (`src/core/pixels.ts`) | Drawn as character grids in code | Original, MIT |
| Demo photos, book covers, night skyline, badges (`src/demo/`) | Generated procedurally in code | Original, MIT |
| App icons (`public/`) | `scripts/make-icons.mjs` | Original, MIT |
| Demo text (diary entries, bios) | Written for this project; owners are fictional and labelled as demos | Original, MIT |
| Quoted line | One sentence from George Eliot's *Middlemarch* (1871, public domain) appears in a demo entry; book titles and authors are named only | public domain |
| Fonts | Only system font stacks; no web fonts are loaded | n/a |
| Hunyuan3D-2 bookcase | **Removed** from the repository (licence excludes EU, UK, South Korea). Still in git history; never used by the app | Do not reuse |
| `截图合集.pdf` in the repo root | Owner-provided screenshots of unknown provenance | **Removed** from the branch; provenance was never established. Still in earlier git history; not shipped |

## GeoCities and historical sites
The product is inspired by the culture of early personal homepages, webrings and 88×31 badges. No historical page,
image, GIF or text from GeoCities archives or other sites is copied or shipped.

The locally served MediaPipe Face Landmarker float16 v1 bundle is by Google (Apache-2.0). Its SHA-256 is
`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
[Google model file](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) · [Task and model cards](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).

## V6 room update

The CRT controls, vents and speaker grille and the grooved record player are authored in the project's Blender source and distributed under the repository MIT licence. House selection illustrations and browser-synthesised room tone come from this project's earlier experience-integration branch. Owner recordings, album art and photographs are local user media. The reference videos, commercial album covers and game art are not included in the build.
