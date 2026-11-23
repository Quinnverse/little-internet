# Tasks: Mobile Editor

- [x] 1. Pure editor logic
  - [x] 1.1 `ids.ts`, `commands.ts`
  - [x] 1.2 PBT E1–E4 in `tests/editor.pbt.test.ts`
  - _Requirements: 3, 4.1, 4.5, 5.3_
- [x] 2. Persistence: `idb.ts`, `store.ts` (validate on load, never overwrite invalid data)
  - _Requirements: 2_
- [x] 3. App shell: Preact setup, tab bar, styles, manifest, icons, service worker
  - _Requirements: 9_
- [x] 4. Setup screen
  - _Requirements: 1_
- [x] 5. Diary + entry sheet (photos resized on device, video link, visibility toggle)
  - _Requirements: 4_
- [x] 6. Room grid editor (select, move, resize, add, remove; private markers)
  - _Requirements: 5_
- [x] 7. Preview via service worker
  - _Requirements: 6_
- [x] 8. Door: counts, download website, private backup, import/restore, links
  - _Requirements: 7_
- [x] 9. Settings
  - _Requirements: 8_
- [x] 10. Browser check on a phone-sized viewport: setup → entry with photo → make public →
      preview → download website → unzip and serve → re-import
  - _Requirements: all_

## Verified
`npm run e2e` (scripts/e2e.sh) runs the whole chain in headless Chromium at 390×844 and
passes 19/19 checks, including: new entries private by default, preview hides private
entries and runs ghost.js, the downloaded ZIP served from another origin under `/@moon/`
loads with zero failed requests, the ghost guides a visitor to the latest entry, and
re-importing the ZIP into an empty editor restores the public entry.

## Follow-ups
- Icons are emoji/Unicode characters; headless Chromium has no emoji font, so they render
  blank in screenshots. Replace close/toolbar/tab icons with inline SVG before the video.
- Not yet tested on a physical iPhone/Android (Requirement 9.2).
