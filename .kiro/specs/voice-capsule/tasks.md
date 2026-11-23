# Tasks: Voice Time Capsule

- [x] 1. Schema, storage, privacy, normalize for recordings + `voice` block
- [x] 2. Generator: voice block, audio files, CSP, ghost guide link
- [x] 3. Arbitraries and properties include recordings (P1–P7, E1–E2)
- [x] 4. Commands
- [x] 5. Recorder + audio file validation (browser)
- [x] 6. VoiceSheet + "Answering machine" in Add menu
- [x] 7. e2e: choose a file, make public, play in exported site; private one absent

## Verified
- Properties P1–P7 and E1–E2 now generate recordings; P4 checks that every private
  recording is absent from the export and every public one is present.
- Old saves without `recordings` load (unit test).
- e2e (headless Chromium, fake microphone): records via MediaRecorder, chooses a WebM
  file, reads its duration (WebM reports Infinity at first), makes one public with an
  open-on label; the export holds exactly that one audio file, and it loads metadata on a
  different static host. 41/41 checks.

## Bugs found on the way
- e2e: a chosen `.webm` file arrives as `video/webm` (browsers label by extension), so it
  was refused. Mapped `video/{webm,mp4,ogg}` to audio; playback is still verified.
- e2e: the ghost's bubble opened above the ghost even at the top of the page, off-screen,
  so its links could not be clicked. It now opens below when there is no room above.

## Still to verify on real devices
- Safari (iPhone/Mac) recording produces MP4/AAC; check it plays in Chrome/Firefox, and that
  WebM recordings from Chrome play in Safari.
