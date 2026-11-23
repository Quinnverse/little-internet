# Design: Mobile Editor

## Stack

Preact + hooks (small runtime, JSX), plain CSS. No router: a single `screen` state.
All data logic is in pure modules under `src/editor/` that are tested in Node.

## Modules

| Module | Responsibility |
|---|---|
| `src/editor/commands.ts` | Pure commands: `createProject`, `addPost`, `updatePost`, `deletePost`, `setVisibility`, `addAsset`, `addBlock`, `moveBlockTo`, `resizeBlockTo`, `deleteBlock`, `setBlockText`, `addLink`, `deleteLink`, `setWebring`, `updateSite`, `updateGhost`, `collectGarbage` |
| `src/editor/ids.ts` | Random ids and unique post slugs (`slugify` with ASCII fallback `entry-<id>`) |
| `src/editor/store.ts` | `useProject()` hook: holds state, `apply(command)` validates via `parseProject`, debounced IndexedDB save |
| `src/editor/idb.ts` | Minimal IndexedDB get/put for one key |
| `src/editor/images.ts` | Browser-only: resize/re-encode photos with `createImageBitmap` + canvas |
| `src/editor/download.ts` | Save bytes as a file; read a picked file as bytes |
| `src/editor/preview.ts` | Push `generateSite` output into the preview cache; returns the iframe URL |
| `public/preview-sw.js` | Service worker: serves `/preview/*` from Cache Storage; app-shell caching for offline |
| `src/editor/ui/*.tsx` | Screens: `Setup`, `Room`, `Diary`, `EntrySheet`, `Door`, `Settings`, `Preview` |

## Command contract

```ts
type Command = (p: Project) => Project
apply(cmd): Result  // runs cmd, then parseProject; on failure keeps state, returns reason
```

Commands receive `Clock` and `Ids` dependencies through a context object so property tests
can drive them deterministically.

`addPost` always creates `visibility: 'private'`; only `setVisibility` makes it public.

## Preview

1. `preview.ts` calls `generateSite(project)`.
2. Writes each file into Cache Storage `li-preview` as `Response` objects at
   `<app>/preview/<path>` with the right `Content-Type`, deleting stale entries.
3. The iframe loads `<app>/preview/index.html?v=<n>`; the service worker answers from the
   cache. Relative links inside the site work unchanged, and the generated CSP applies.

This uses the exact generator and `ghost.js` of the export.

## Screens

Bottom tab bar: **Room · Diary · Door · Settings**, plus a **Preview** button in the top bar.
Sheets slide up from the bottom for editing. All buttons ≥ 44 px.

## Correctness properties

| # | Property | Validates |
|---|---|---|
| E1 | For any sequence of commands applied through `apply`, the Project is always valid | 3.1 |
| E2 | `addPost` always yields a private post; only `setVisibility` changes it | 4.1 |
| E3 | After any `deletePost`/`deleteBlock`, no block references a missing post and no asset is unreferenced | 3.2 |
| E4 | Generated post slugs are unique and match the slug pattern for any titles (incl. CJK/emoji) | 4.5 |
