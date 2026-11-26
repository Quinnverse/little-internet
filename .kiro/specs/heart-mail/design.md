# Design: Heart Mail

`server/mail.ts` (tables friendships, blocks, mail), identity by site slug + hashed owner key. Client: `src/editor/people.ts` (calls, outbox, `sendQueued`, `flushOutbox`). UI: `PeopleSheet.tsx`, `LetterAtelier.tsx`. Polling every 20–25 s while visible; contacts the server only after the owner opened People once. Not built: push/SSE.

Verification: `tests/mail.test.ts` (mutation-checked: owner check, friendship check, idempotency); `scripts/e2e-mail.mjs` (two browser profiles, real server).
