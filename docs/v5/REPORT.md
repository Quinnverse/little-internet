# V5 "The Human Internet": honest report

Branch `v5/human-internet`. Statuses: PASS / PARTIAL / FAIL / NOT_TESTED / NOT_BUILT. There is no global PASS.
"Automation" = headless Chromium, real local server. "Synthetic" = landmarks built by code. "Fake camera" = Chromium
looping a real hand photo as a video. None of these is a real webcam, a real phone or Safari.

| Key | Status | What exists | What it does not prove |
|---|---|---|---|
| STABILITY | PASS (V4 fixes) | WebGL context leak fixed, recovery panels; `scripts/stability.mjs` 9/9; Web Atelier e2e 45/45 after V5 | not re-run on real phones |
| ART_QUALITY | PARTIAL | camera, quiet room, sparkle sticker made legible | villa and cabin interiors are still the same 6x6 room (NOT fixed) |
| HOME_ATELIER | PARTIAL | decorate mode as before | multi-room, furniture catalog, expansion NOT_BUILT |
| WEB_ATELIER | PASS (V3) | 45/45 e2e | gifts are not placeable from the Atelier UI; the owner publishes a gift via its archive entry |
| BOO_MULTIMODAL | PARTIAL | wave/heart/open palm/thumbs-up reactions; real thumbs-up photo recognised in Boo's panel (fake camera); local chat | no real motion test; no face/smile; no autonomous follow; no emotion claims by design |
| AIR_DRAWING | PARTIAL | pinch pen on the shared Stroke model; pointing moves without drawing (fake camera); mouse works with camera on; 10 stroke tests | pinch drawing NOT_TESTED on real video; only synthetic pinch streams |
| LETTER_ATELIER | PARTIAL | papers, text, stickers, stamps, seal, tape, photo, drawing, voice, undo/redo, layers, drafts, templates; screenshots on desktop and 390 px | photo upload and voice recording not exercised in a browser test; drag tested only by hand-written hit boxes in screenshots |
| HEART_MAIL | PARTIAL | friends, blocks, send, unread, read, delete, outbox retry, idempotency; mail.test.ts 10 (mutation-checked); two-profile e2e 16/16 | reject/rate limit only in unit tests; no push |
| CROSS_DEVICE_DELIVERY | PARTIAL | two separate browser profiles through one real server, offline failure then retry without a duplicate | not two real devices or networks |
| MEMORY_GIFTS | PARTIAL | private by default, sender ceiling enforced three ways, SVG on public page; gifts.test.ts 8; real-server anonymous reader 7/7 | frame/drawer/cabinet placements beyond a wall photo NOT_BUILT |
| TOGETHER_SPACE | NOT_BUILT | only friends and Heart Mail | no shared space |
| PRIVACY_GATE | PASS | camera off by default (e2e), indicator, Stop releases tracks (e2e), no frame storage by design, model self-hosted, gifts private by default | no external privacy audit |
| PORTABILITY_GATE | PASS | backup/restore and export include gifts (tests) | |
| MOBILE_READY | PARTIAL | letter editor and draw pad checked at 390 px by screenshot | not a real phone; camera on phones NOT_TESTED |
| KIRO_VERIFIED | PARTIAL | specs, steering, 4 hooks written in this Kiro Web session | hooks not loaded/verified in Kiro IDE; tasks were not run through the spec task runner |
| PRODUCTION_DEPLOYED | NOT_TESTED | owner deploys | image is now ~30 MB larger (MediaPipe model and WASM) |
| SUBMISSION_READY | NOT_TESTED | docs and demo script need the V5 climax added after a real-camera rehearsal | Devpost rules not re-read (HTTP 403 earlier) |

## Perception evidence, by kind
- Synthetic landmarks: `tests/perception.test.ts` (18; 11 mutants killed: hold, pinch debounce, cooldown, score floor, mirroring, hand-loss pen lift, heart rules, router modes, confidence floor, open-palm-while-waving).
- Real model on real photos: `scripts/probe-tracker.mjs` on a thumbs-up, a pointing finger and a victory sign classified correctly (thumbs_up, pointing, neither open palm nor pointing). No real photo of open palm, pinch or two-hand heart was tested.
- Fake camera in Chromium: `scripts/e2e-camera.mjs` 10/10 (consent, load from this site, detection, recogniser, UI, release, refusal path).
- Real webcam: NOT_TESTED. Run `docs/REAL_DEVICE_CHECKLIST.md` with the V5 camera items before recording the demo.

## Known risks
- The two-hand heart rule is a geometric heuristic tuned on synthetic poses. Real hands may need threshold changes.
- Hand tracking costs ~22 MB on first use (model + WASM), loaded only after the owner presses the camera button.
- The service worker never caches `/vision/`, so offline use of the camera needs a first online load per visit.
