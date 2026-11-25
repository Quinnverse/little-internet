# Three-minute demo: script, shots and reset

Record from the **deployed** app on a real desktop and a real phone. Only show what exists. Do not show
features listed under "Honest limits". Do not read out numbers you have not measured.

## Before recording (reset)
1. Demo homes: `SERVER=https://resurrection.quinnverse.tech KEYS=~/.li-demo-keys.json node scripts/seed-demo.mjs`
   (re-publishes the same three sites; any guestbook notes stay).
2. Fresh browser profile or **Settings → Delete this home from this device** (this is the reset for a demo copy).
3. Pick a second device (phone) for the visitor, on mobile data if possible.
4. Close the Door state: make sure your own test home is open.

## Script (target 2:50)
| Time | Screen | Voice-over (plain, no hype) |
|---|---|---|
| 0:00–0:15 | Montage: an old homepage with a spinning globe, "under construction", a guestbook (use your own recreation, not archive screenshots) | "The internet used to feel like a place. Somewhere along the way we lost our little corners of it." |
| 0:15–0:35 | First screen of the app, 3D room turning, **Try a demo home** | "Little Internet is a small home in the browser and a website you build yourself. No account." |
| 0:35–1:00 | Midnight demo: tap diary, answering machine, shelf; write one entry; choose a keepsake **or none** | "Entries are private by default. A keepsake is a choice, never automatic." |
| 1:00–1:40 | Tap the computer → Decorate my website. Change background tile, font; add Guestbook and a sticker; drag one component up; switch to Phone preview; open the badge editor, change text | "This is a real editor, not a theme picker. Order, size, colours, stickers, an 88 by 31 badge." |
| 1:40–2:05 | Publish. On the phone open the address; tap the welcome voice; sign the guestbook; on the laptop approve it | "Visitors only see what you published. They press play themselves. Notes wait for your approval." |
| 2:05–2:25 | Webring: Next → Book Nook, Next → Sea (three different personalities) | "Neighbours are linked by people, not by a feed. Three fictional owners, three different sites, same editor." |
| 2:25–2:45 | Make a public entry private: phone reloads without it. Close the Door: phone shows "door is closed". Move my home → Download website ZIP; disconnect network; open the ZIP's index.html | "Making it private updates the live site. Closing the door removes it. And you can take the whole site with you." |
| 2:45–2:55 | Kiro: show `.kiro/`, `docs/KIRO_TASKS.md`, the failing-then-passing privacy test | "Built with Kiro: steering, specs and property tests, including one we broke on purpose to see it fail." |
| 2:55–3:00 | Title card | "Little Internet. A little corner of the internet. Yours to keep." |

## Shot list (what must be on screen)
Home 3D (day), Web Atelier desktop, Web Atelier phone drawer, badge editor, published site on the phone, guestbook
approval, `/ring/` or three demo sites, privacy change reflected live, "door is closed" page, ZIP opened offline, `.kiro/` tree.

## Do not say
Anything about win chances, user numbers, FPS you did not measure, "AI pet", "works on Safari" or "tested on iPhone"
until the real-device checklist says so.
