# Real-device manual test checklist

> **STATUS: NOT TESTED on physical devices.** No iPhone or Android handset was
> available in the build environment. All items below are therefore marked
> `NOT TESTED`. Desktop Chromium E2E (49 checks) and Chrome-driven publish E2E
> (12 checks) passed on emulated mobile viewports, but emulation is not a
> substitute for real hardware — especially for microphone permission, codec
> behaviour and PWA installation. Do not report any item below as passed until a
> human actually performs it on the named device and records the result.

How to use: for each row, set result to PASS / FAIL / NOT TESTED, add device OS
version, and describe any issue in the notes column. Keep screenshots locally;
do not commit private diary content or recordings.

## iPhone (Safari) — NOT TESTED

| # | Test | Steps | Expected | Result | Notes |
|---|------|-------|----------|--------|-------|
| i1 | PWA install | Open app in Safari → Share → Add to Home Screen | Icon appears; opens full-screen | NOT TESTED | device/OS: __ |
| i2 | Touch targets | Tap every button with a finger | All targets >=44px, no mis-taps | NOT TESTED | |
| i3 | Mic permission | Record a message; accept mic prompt | Recording works after permission | NOT TESTED | |
| i4 | Safari codec | Record then play back your own message | M4A/AAC playback works | NOT TESTED | |
| i5 | Cross-browser play | Play a WebM/Opus clip recorded on Chrome | Safari plays or shows clear error | NOT TESTED | known risk: Safari has limited WebM/Opus support |
| i6 | Draft recovery | Type a draft, refresh, reopen | Draft restored from IndexedDB | NOT TESTED | |
| i7 | Upload photo | Add a photo from Photos | Thumbnail + published image load | NOT TESTED | |
| i8 | Site sharing | Publish, open link in a new tab | Public site loads with ghost | NOT TESTED | |
| i9 | Ghost animation + popup | Tap the ghost, observe states | Animates; bubble opens on-screen | NOT TESTED | |
| i10 | Keyboard/scroll | Scroll long diary with touch | No horizontal scroll; smooth | NOT TESTED | |

## Android (Chrome) — NOT TESTED

| # | Test | Steps | Expected | Result | Notes |
|---|------|-------|----------|--------|-------|
| a1 | PWA install | Open app → install prompt / menu → Install app | Installs; offline shell works | NOT TESTED | device/OS: __ |
| a2 | Touch targets | Tap every button with a finger | All targets >=44px, no mis-taps | NOT TESTED | |
| a3 | Mic permission | Record a message; accept mic prompt | Recording works | NOT TESTED | |
| a4 | Chrome codec | Record then play back | WebM/Opus playback works | NOT TESTED | |
| a5 | Cross-browser play | Play an M4A clip recorded on Safari | Chrome plays M4A | NOT TESTED | |
| a6 | Draft recovery | Type a draft, refresh, reopen | Draft restored | NOT TESTED | |
| a7 | Upload photo | Add a photo from Gallery | Thumbnail + published image load | NOT TESTED | |
| a8 | Site sharing | Publish, share link via OS share sheet | Public site loads for recipient | NOT TESTED | |
| a9 | Ghost animation + popup | Tap ghost | Animates; bubble opens on-screen | NOT TESTED | |
| a10 | Low-end performance | Use a modest device | UI remains responsive | NOT TESTED | |

## Notes on known compatibility risks (to verify, not claims)

- **Recording format:** the recorder uses the browser's supported MIME. Chrome
  commonly produces `audio/webm;codecs=opus`; Safari commonly produces `audio/mp4`.
  A clip recorded on one may not play on the other. The exported site carries the
  original MIME with a matching file extension, so each file is served correctly,
  but true cross-browser playback of a single clip is **unverified**.
- **PWA installation** depends on HTTPS and a valid manifest/service worker;
  verified only structurally in Chromium E2E, not on a real home screen.

## Sign-off

Physical-device testing completed by: __________  Date: __________
Summary: ____ PASS / ____ FAIL / ____ NOT TESTED
