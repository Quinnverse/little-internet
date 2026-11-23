# Requirements: The Ghost

## Introduction

The ghost is a small companion that lives in the owner's home. It has two faces with
strictly separated data:

- **Visitor ghost** — `ghost.js`, shipped inside every generated site. Public data only.
  Four states: Idle, Sleep, React, Guide.
- **Owner ghost** — inside the editor only. May read private entries on the device to
  offer *memories*. Never sends anything anywhere.

No LLM, no backend, no network requests in either.

## Requirements

### Requirement 1: Visitor ghost states

1. WHEN a page loads and the ghost is enabled, THE ghost SHALL appear in the first
   ghost-home block, or in the bottom-right corner when there is none, in **Idle**
   (gently floating).
2. WHEN there has been no pointer, key, scroll or touch activity for 20 seconds, THE ghost
   SHALL enter **Sleep** (eyes closed, "z" marks); any activity SHALL wake it to Idle.
3. WHEN the newest public entry was created within the last 7 days (visitor's clock),
   THE ghost SHALL enter **React** once after load: a small jump and a bubble naming the
   entry with a link to it, then return to Idle.
4. WHEN the visitor taps or clicks the ghost, or presses Enter/Space while it is focused,
   THE ghost SHALL enter **Guide**: a bubble with a greeting and up to 4 links (latest
   entry, friends, a random webring site, the feed). Tapping again, Escape, or tapping
   outside SHALL close it.
5. THE ghost SHALL be a real button with an accessible name; the bubble SHALL be announced
   politely (`aria-live`).
6. WITH `prefers-reduced-motion: reduce`, THE ghost SHALL not float or jump; states SHALL
   still change.

### Requirement 2: Visitor ghost safety and independence

1. `ghost.js` SHALL build all DOM with `createElement`/`textContent`; no HTML strings
   from data.
2. Ghost data in pages SHALL come from the public projection only.
3. `ghost.js` SHALL make no network requests and SHALL work on any static host and from
   `file://`.
4. WHEN ghost data is missing or malformed, THE page SHALL work normally without a ghost.

### Requirement 3: Owner memories (editor only)

1. A ghost button in the Room header, and a "Talk" action on the selected ghost's spot,
   SHALL open the owner ghost, labelled "Only you see this". (A plain tap on the spot
   selects it, like every other block, so it can still be moved.)
2. *On this day*: THE owner ghost SHALL show entries (private or public) written on the
   same month and day in earlier years, newest year first.
3. *Ask*: WHEN the owner types a word or phrase, THE owner ghost SHALL find the most recent
   entries containing it (case-insensitive; works for Chinese), and show the date and a
   short excerpt around the match, with a way to open the entry.
4. THE owner ghost SHALL only show text that exists in the owner's entries. It SHALL say
   so plainly when nothing matches.
5. Memories SHALL be computed on the device with no network access.
