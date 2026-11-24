---
inclusion: always
---

# Product: Little Internet 2.0

**Tagline:** Your world, your web. A small home that remembers your life.
**Principle:** Private by default. Personal by design. Portable by nature.

A cozy life-sim where the **home is the interface**. The owner lives in a small 3D house
with a pet. The things in the house are real entry points: the diary on the desk opens the
writing sheet, the computer opens the owner's personal website, the answering machine plays
the owner's own voice, the shelf holds memories, the door is how visitors come in.

Hackathon category: **Resurrection**. What we resurrect is the **GeoCities-era personal
homepage** (a plot of the web you decorate and own, friend links / webring, a guestbook) and
the **answering machine**, rebuilt as a home you live in. What is new today: a 3D room in the
browser, memories that become objects, and a site you can export and keep running without us.
Death is part of the theme, not a contradiction: the pet keeps the house warm, and the owner's
real voice stays in it.

## One world, three views (one data model, no duplicated content)

- **Home** (3D room): the emotional view. Tap an object to use it.
- **Journal** (lists/sheets): the efficient view. Write and read without hunting for a desk.
- **Web** (generated static site): the public view, opened from the computer, exportable.

A memory is written once and shown in all three. Changing visibility or deleting it updates
the room object and the public page together.

## Privacy defaults (unchanged, non-negotiable)

- Every new post, recording and memory object is **private** by default. Making something
  public is an explicit owner action, every time. No reward, level or unlock depends on
  publishing.
- Private content lives on the device (IndexedDB) and in the private backup. It never
  reaches any server, API, or AI service. The backend receives only the **public
  projection** the owner chooses to publish.
- A memory object is only generated from a choice the owner makes (pick an object kind). The
  system never reads private text to decide what to create.

## Product form (decided)

- Web App, installable PWA, phone first, with tablet/desktop layouts. 3D room is the main
  screen; sheets (standard HTML) are used for writing, so input stays comfortable.
- Languages: **English and Chinese (zh)**, switchable at runtime, default from the browser.
  The exported site uses the owner's chosen site language.
- What users publish is an **independent static website** that also contains an optional 3D
  room runtime for visitors. It must stay readable without JavaScript and without WebGL.
- Online publishing and ZIP export use **the same generator**. No second rendering path.
- Publish address: `<host>/@<slug>/`.
- 3D assets: low-poly models built in **Blender from code** (`assets/blender`), reviewed by the
  owner, quantized and embedded in the app and in `room.js`. The code-drawn Three.js objects stay
  as the fallback when a model is missing. No runtime AI calls. The Hunyuan3D-2 pipeline is kept
  (`scripts/assets`, `assets/hunyuan`) but no Hunyuan model ships today.

## Two files, never confused

- **Site export ZIP**: public projection only. Deployable. HTML, CSS, RSS, assets, ghost
  runtime, room runtime, public `site.json`.
- **Private backup**: full project including private items and room layout. Never deployed.

## The one acceptance chain (must never break)

**Edit → Publish → Export → Run independently → Re-import**

## Priority order (cut from the bottom)

1. Ownership and export chain (static, self-contained, re-importable)
2. Home: one polished room, pet, tappable objects, rotate/zoom, mobile controls
3. Memory → object (owner chooses), diary/journal sheets, voice welcome at the door
4. Visitor entrance (door, doorbell, pet greeting, welcome voice, public objects)
5. Computer → website, publish to backend, guestbook with owner moderation
6. Decorate mode (wallpaper, floor, furniture move/rotate/add/remove, 2 house styles)
7. Webring / friend links, themes

Rule: a new feature may only enter by **replacing** one of equal cost.

## Backend (added in 2.0)

A small Node server: hosts published sites at `/@slug/`, and stores guestbook messages.
- Publishing accepts only a site-export ZIP (public data). The owner proves ownership of a
  slug with a secret key created in their browser; the server stores only its hash.
- Guestbook: visitors leave text only. Messages are **pending** until the owner approves
  them. Rate limited, length limited, rendered as text. Works only on the platform copy;
  exported copies on other hosts hide the form.
- No accounts, no emails, no analytics, no visitor counters.

## Voice welcome

Real recordings only. No synthesis or cloning. The owner marks one recording as the welcome.
Visitors press play themselves; nothing autoplays. "Open on" stays a label, never a lock.

## Pet

The existing ghost is the pet. Four states (idle, sleep, react, guide), local rules only.
In the room it walks/sits near the diary or desk and greets visitors. Visitor-side it only
knows public content. Owner-side memories (on this day, ask) stay on device.

## Memory objects

When saving an entry the owner may pick an object (shell, postcard, plant, ticket, photo
frame, candle, book, ...). It appears in the room, can be placed on the shelf, desk or
wall, and opens that entry. Objects tied to private entries are never shown to visitors.
Growth is calm: basic furniture is free; there is no streak, no word-count reward, no
currency.

## Frozen scope. Do NOT add

Furniture shop / currency / economy, forum or town square, follows, notifications, visitor
counters, runtime LLM/cloud AI features, voice synthesis/cloning, memorial/inheritance modes,
inactivity-triggered behaviour, first-person walking, multiplayer, multiple rooms (one room;
house style is a skin), video upload, user-authored HTML/CSS/JS, visitor voice messages.

## Honesty rules for the submission

- Never describe something in the video that is not a running feature.
- The 3D models are made in Blender by script; say so. Do not claim AI-generated 3D in the app:
  the Hunyuan3D-2 pipeline exists but nothing it made is shipped.
- External embeds and outbound links are not guaranteed to keep working after export.
- Sample/demo content must be labelled as sample.
