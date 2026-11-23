# Design: The Ghost

## Visitor ghost (`src/runtime/ghost.js`)

Plain ES5-compatible script, no dependencies, wrapped in an IIFE.

Data (`<script type="application/json" id="ghost-data">`, built by `generate.ts#ghostData`):

```ts
{ enabled, name, color, greeting,
  guide: Array<{ label, href }>,               // ≤ 4
  latest?: { title, href, createdAt } }        // newest public entry, for React
```

State machine (`state` ∈ idle | sleep | react | guide):

| From | Event | To |
|---|---|---|
| idle | 20 s without activity | sleep |
| sleep | activity | idle |
| idle (after load) | latest within 7 days | react (4 s) → idle |
| any | ghost activated | guide |
| guide | ghost activated / Escape / outside tap | idle |

State is reflected as `data-state` on the ghost root; CSS in `style.css` animates by state.
The ghost body is an inline SVG built with `createElementNS`.

Timers are injectable for tests: the script reads `window.__ghostClock` if present
(`{ now(), setTimeout, clearTimeout }`), otherwise the real ones.

## Owner memories (`src/editor/memories.ts`)

```ts
onThisDay(posts, today: Date): Post[]          // same month/day (local), earlier years
askMemories(posts, query, limit = 3): Array<{ post, excerpt: string }>
```

`excerpt` is a substring of the post's title or body (≤ 120 chars) around the first match.

## Properties

| # | Property | Validates |
|---|---|---|
| G1 | For any ghost data (arbitrary strings incl. HTML), running `ghost.js` in jsdom adds only the expected element types and every text node equals some data string or a fixed UI string | 2.1 |
| G2 | For any timeline of activity events, the state follows the table (sleep only after ≥ 20 s idle; any activity from sleep → idle) | 1.2 |
| G3 | For any posts and query, every `askMemories` result contains the query (case-insensitive) and its excerpt is a substring of that post's title or body | 3.3, 3.4 |
| G4 | For any posts and date, `onThisDay` returns only posts with the same month/day and an earlier year, sorted newest year first | 3.2 |
