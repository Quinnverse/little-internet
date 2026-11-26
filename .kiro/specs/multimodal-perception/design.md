# Design: Multimodal perception

- `src/perception/gestures.ts`: pure pose rules on 21 landmarks, thresholds relative to hand size.
- `src/perception/recognizer.ts`: `GestureRecognizer.feed(frame) -> events`; deterministic given frame times.
- `src/perception/router.ts`: `ContextRouter` maps events to `Action` (cursor, boo, draw, propose-gift). No action can mutate data.
- `src/perception/tracker.ts`: lazy MediaPipe HandLandmarker (GPU, CPU fallback), files from `public/vision`.
- `src/perception/camera.ts`: `CameraSession` (getUserMedia, loop at most ~20 fps with back-off, brightness hint, stop on pagehide).
- `src/editor/ui/CameraControl.tsx`: the only UI door to the camera. Used by DrawPad (draw), the letter send view (send) and Boo (boo).
- Service worker never caches `/vision/`. Build copies the WASM (`scripts/copy-vision.mjs`).

Verification: `tests/perception.test.ts` (synthetic streams, mutation-checked), `scripts/probe-tracker.mjs` (real model on real hand photos), `scripts/e2e-camera.mjs` (Chromium fake camera looping real photos).
