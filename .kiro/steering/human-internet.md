# Steering: V5 "The Human Internet" (perception, letters, gifts)

Read with `product.md`, `security.md`, `tech.md`. These rules override convenience.

## Camera and microphone
- Off by default. Only a press on a visible button turns them on. While on, a "Camera on" light and a Stop button are always visible.
- Video frames are analysed in memory and dropped. Never store, upload, log or screenshot frames, landmarks over time, or audio from the camera path.
- No face identity, no emotion or mood claims, no profiling. A face-based feature (e.g. smile) may only trigger a gentle question, never a statement about feelings.
- MediaPipe model and WebAssembly are self-hosted (`public/vision`). No CDN, no third-party request.
- The camera is never required. Every camera feature has a mouse/touch/pen equivalent that shares the same model (`Stroke`, `Letter`).

## Gestures
- A gesture event carries `eventId, eventType, timestamp, source, confidence, interactionSessionId`.
- A gesture may only produce a reaction, a cursor/pen movement, or a *proposal*. It must never send, delete, publish or change data. The router's `Action` type has no such member; keep it that way.
- Send mode turns a heart into a proposal; the owner confirms with a tap. Boo-interaction gestures never create gifts.
- New thresholds are relative to hand size, need a hold time, a cooldown and hand-loss handling, and need tests on synthetic landmark streams. Mutate the rule and watch a test fail before trusting it.

## Heart Mail and gifts
- Identity = home address + owner key (the publish key). The key never enters a backup or a website.
- Every mail route checks the key AND the friendship/block state on the server. Sends are idempotent by `clientId`.
- A UI success message appears only after the server answered 2xx. Failures show the reason and keep the letter in the outbox when a retry makes sense. Never play a success animation on failure.
- A received letter is private by default. The sender's `shareable` flag is a ceiling: it allows the owner to publish, it never publishes. Enforced in commands, schema and `publicProjection`. Deleting a placement does not delete the gift.

## Honest reporting
- Report each area as PASS / PARTIAL / FAIL / NOT_TESTED. Separate: real camera, recorded or fake video, synthetic landmarks, automation.
- Never claim Safari, real devices, Docker or production were tested unless they were.
