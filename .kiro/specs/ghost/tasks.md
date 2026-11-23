# Tasks: The Ghost

- [x] 1. `ghostData` adds `latest`; guide gets the feed link; cap at 4
- [x] 2. `ghost.js` state machine, SVG body, bubble, keyboard, reduced motion
- [x] 3. Ghost CSS in the generated `style.css`
- [x] 4. PBT G1, G2 (jsdom + fake clock)
- [x] 5. `memories.ts` + PBT G3, G4
- [x] 6. Owner ghost sheet in the Room
- [x] 7. e2e: ghost states visible in the exported site; owner memory search

## Verified
- G1–G4 pass (tests/ghost.pbt.test.ts), plus unit tests for react, guide open/close,
  missing/disabled data, and corner placement.
- e2e: the exported site's ghost is in React state on arrival with the new entry's title,
  guides the visitor to it; owner ghost finds public and private entries by word.

## Bug found by PBT
G1 found that `ghost.js` accepted the guide href `" JAVASCRIPT:x"`: the check tested for a
scheme at position 0, but browsers strip leading whitespace/control characters from URLs,
so the link would have run script. Generated data never contains such hrefs (the core
schema rejects them), so this was defence-in-depth, but it is now an allow-list and the
test resolves every href the way a browser does.
