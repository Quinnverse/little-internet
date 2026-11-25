# Stability: "the home / website sometimes does not open"

Reproduced on 2026-11-25 with `scripts/stability.mjs` (headless Chromium, 390×844 touch). Raw output:
`stability-before.txt`, `stability-after.txt`.

| # | Root cause | Evidence | Fix |
|---|---|---|---|
| 1 | `webglAvailable()` created a **new WebGL context on every call and never released it**. `Home` called it on every render (`useState(flatPref() || sceneFailed())`). Browsers keep about 16 contexts and silently kill the **oldest**, which is the room. | +49 contexts over 12 open/close rounds; console: "Too many active WebGL contexts. Oldest context will be lost." | Probe once, cache the answer, release the probe context; lazy `useState` initialiser |
| 2 | `RoomView.dispose()` never freed its GPU context (Setup → Home switch left one behind) | contexts created per page = 2 | `forceContextLoss()` on dispose |
| 3 | No handling of `webglcontextlost`/`restored`: a phone that drops the context in the background leaves a frozen or black canvas | code review + forced loss test | listeners + `preventDefault`, redraw on restore, a visible message with **Try again / Reload / Simple view** if it does not come back in 4 s |
| 4 | If the models failed to parse the room never mounted and nothing was shown ("loading forever") | code review (`preloadModels().then` without a rejection path) | rejection shows the same recovery panel |
| 5 | Published site: if the 3D room could not start (GPU refuses a context, exception), the page stayed `inert` and scroll-locked: visitor sees a page they cannot use | `stability-before.txt`: `{"inert":true,"locked":true,"overlay":true}` | start in `try/catch`, release the page on any failure; context loss hands the visitor the plain website |
| 6 | Service worker cached API and published pages (fixed earlier, v3) | `tests/sw.test.ts` | already fixed |

Result: 9/9 stability checks (cold start ×3, 12 UI rounds, context loss + restore, background/foreground,
reload, offline reload, published site with a refusing GPU).

Not covered: real iOS Safari behaviour (it drops contexts more aggressively than Chromium), slow networks
(`models` are embedded, so there is no model fetch to fail), memory growth over hours.
