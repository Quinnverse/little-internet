# Design: Voice Time Capsule

## Data

```ts
Recording = { id, title, createdAt, visibility, durationMs, mime: AudioMime, data: Uint8Array, openOn?: 'YYYY-MM-DD' }
Project.recordings: Recording[]          // zod .default([]) → old saves load (Req 1.2)
Block content: { kind: 'voice' }
```

Stored form (`site.json`, `backup.json`): recordings carry `path: audio/<id>.<ext>` instead
of bytes (`webm`, `m4a`, `ogg`, `mp3`). This is an additive field with a default, so
`schemaVersion` stays 1 (nothing older than today exists; documented in steering).

## Core changes
- `privacy.ts`: drop private recordings.
- `normalize.ts`: recordings newest first.
- `generate.ts`: render `voice` blocks; write `audio/*`; CSP `media-src 'self'`;
  ghost guide "Listen to my voice" → `index.html#voice`.
- `storage.ts` / `zip.ts`: recordings round-trip through paths.

## Editor
- `recorder.ts` (browser): picks the first supported MediaRecorder type of
  `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg;codecs=opus`; measures duration itself
  (WebM from MediaRecorder reports `Infinity`); hard stop at 60 s.
- `audioFile.ts` (browser): validates a chosen file's type/size and reads its duration.
- `VoiceSheet.tsx`: list + record/choose + per-recording controls.
- Commands: `addRecording` (always private), `updateRecording`, `setRecordingVisibility`,
  `deleteRecording`.

## Properties (extend existing)
- P1/P2/P4/P6/P7 now generate recordings; P4 asserts private recording titles and audio
  files never appear in exports. E1/E2 include recording commands.

## Known limitation
Browsers record in different formats (Chrome/Firefox: WebM/Ogg Opus; Safari: MP4/AAC).
Current browsers generally play all of them, but very old Safari may not play WebM.
The UI notes the format; verified playback is part of the device test.
