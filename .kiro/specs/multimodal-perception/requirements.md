# Requirements: Multimodal perception

1. **Consent.** The camera is off until the owner presses a button; a "Camera on" light and Stop are visible while on; Stop releases every track.
2. **Local only.** Frames are never stored or sent. Model and WASM load from this site.
3. **Events.** Recognised input becomes events with eventId, eventType, timestamp, source, confidence and interactionSessionId.
4. **Gestures.** wave, two-hand heart, open palm, thumbs up, index pointing, pinch (pen).
5. **Robustness.** Hold time, cooldown, release time, hysteresis on the pinch, hand-loss handling, mirrored view, low-light and no-hand hints, slow-device back-off, pause while the tab is hidden.
6. **Context.** The same gesture means different things in different modes (idle, boo, draw, send). No gesture can send, delete or publish.
7. **Fallback.** Every camera feature works with mouse, touch or pen; refusing the camera shows a clear message and breaks nothing.
8. **Air drawing.** Index finger moves, pinch lowers the pen, opening lifts it; the drawing is the same `Drawing` model as mouse drawing.
