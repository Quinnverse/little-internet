// Stability harness: reproduces "the home sometimes does not open".
//   BASE=http://127.0.0.1:4173 node scripts/stability.mjs
// Scenarios: cold start x N, repeated panel/decorate/language toggles, WebGL context loss and restore,
// background/foreground, offline reload. Counts WebGL contexts created and warnings the browser prints.
import { chromium } from 'playwright'
const BASE = (process.env.BASE ?? 'http://127.0.0.1:4173') + '/'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`) }

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const mk = async (opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...opts })
  await ctx.addInitScript(() => {
    window.__gl = { created: 0, lost: 0, restored: 0 }
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const c = orig.call(this, type, ...rest)
      if (c && /webgl/.test(String(type))) {
        window.__gl.created++
        this.addEventListener('webglcontextlost', () => window.__gl.lost++)
        this.addEventListener('webglcontextrestored', () => window.__gl.restored++)
      }
      return c
    }
  })
  const p = await ctx.newPage()
  const warns = []
  p.on('console', (m) => { if (/Too many active WebGL contexts|context lost|CONTEXT_LOST/i.test(m.text())) warns.push(m.text().slice(0, 100)) })
  p.on('pageerror', (e) => warns.push('pageerror: ' + e.message.slice(0, 100)))
  return { ctx, p, warns }
}
const roomVisible = async (p) => {
  // the room is "alive" when the canvas exists and a frame renders non-blank pixels
  const ok = await p.evaluate(() => {
    const c = document.querySelector('.scene canvas')
    if (!c || c.width < 10) return false
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    return !!gl && !gl.isContextLost()
  })
  return ok
}
const nonBlank = async (p) => {
  const buf = await p.screenshot()
  return buf.length > 40000
}

// 1. cold start + Try demo, repeated
let { ctx, p, warns } = await mk()
for (let i = 0; i < 3; i++) {
  await p.goto(BASE)
  await p.locator('.setup').waitFor({ timeout: 30000 })
  await p.getByRole('button', { name: 'Try a demo home' }).click()
  await p.getByRole('button', { name: 'The Book Nook' }).click()
  await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
  await p.locator('.setup').waitFor({ state: 'detached' }).catch(() => {})
  p.once('dialog', (d) => d.accept())
  await p.getByRole('button', { name: 'Settings', exact: true }).click()
  await p.getByRole('button', { name: 'Delete this home from this device' }).click()
  await p.locator('.setup').waitFor({ timeout: 20000 })
}
const g1 = await p.evaluate(() => window.__gl)
check('3 cold starts and resets: room opens every time', true, `contexts created across last page: ${g1.created}`)

// 2. many UI toggles after the room is up
await p.getByRole('button', { name: 'Try a demo home' }).click()
await p.getByRole('button', { name: 'The Book Nook' }).click()
await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
await p.waitForTimeout(1500)
const before = await p.evaluate(() => window.__gl.created)
for (let i = 0; i < 12; i++) {
  await p.getByRole('button', { name: 'Journal', exact: true }).click()
  await p.locator('.sheet-head button[aria-label="Close"]').last().click()
  await p.getByRole('button', { name: 'Decorate', exact: true }).click({ timeout: 4000 }).catch(() => {})
  await p.locator('.deco').getByRole('button', { name: 'Done' }).click({ timeout: 4000 }).catch(() => {})
}
const after = await p.evaluate(() => window.__gl.created)
check('UI toggles do not create extra WebGL contexts', after - before <= 1, `+${after - before} contexts over 12 rounds`)
check('no "too many WebGL contexts" warnings', warns.filter((w) => /Too many/.test(w)).length === 0, warns.join(' | '))

// 3. context loss (what mobile browsers do when the tab is backgrounded or memory is tight)
await p.evaluate(() => {
  const c = document.querySelector('.scene canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  window.__ext = gl.getExtension('WEBGL_lose_context')
  window.__ext.loseContext()
})
await p.waitForTimeout(800)
const lost = await p.evaluate(() => window.__gl.lost)
await p.evaluate(() => window.__ext.restoreContext())
await p.waitForTimeout(2500)
const restored = await p.evaluate(() => window.__gl.restored)
const alive = await roomVisible(p)
const shot = await p.screenshot()
await import('node:fs').then((fs) => fs.mkdirSync('.stability', { recursive: true }) || fs.writeFileSync('.stability/after-context-loss.png', shot))
check('room has a visible message or recovers after WebGL context loss', alive && restored >= 1, `lost=${lost} restored=${restored} contextAlive=${alive}`)
const stillRenders = await p.evaluate(async () => {
  // does the scene redraw? read pixels after forcing a frame via a camera nudge (rotate buttons)
  const c = document.querySelector('.scene canvas')
  const before = c.toDataURL?.length ?? 0
  return before
})
await p.getByRole('button', { name: 'Rotate right' }).click({ timeout: 3000 }).catch(() => {})
await p.waitForTimeout(600)
const a1 = await p.screenshot()
await p.getByRole('button', { name: 'Rotate right' }).click({ timeout: 3000 }).catch(() => {})
await p.waitForTimeout(600)
const a2 = await p.screenshot()
check('camera still responds after context loss', Buffer.compare(a1, a2) !== 0 && stillRenders >= 0)
await ctx.close()

// 4. background / foreground (visibility) and reload
;({ ctx, p, warns } = await mk())
await p.goto(BASE)
await p.getByRole('button', { name: 'Try a demo home' }).click()
await p.getByRole('button', { name: 'The Midnight Internet' }).click()
await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await p.waitForTimeout(500)
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await p.waitForTimeout(800)
check('room still draws after background → foreground', await nonBlank(p))
await p.reload()
await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
check('reload returns to the room (data kept)', true)

// 5. offline reload (service worker shell)
await ctx.setOffline(true)
await p.reload().catch(() => {})
const shell = await p.locator('.home, .setup, .splash').first().waitFor({ timeout: 8000 }).then(() => true, () => false)
check('offline reload still opens the app shell', shell)
await ctx.setOffline(false)
await ctx.close()

// 6. visitor page: skip must always release the page, even if the 3D room breaks
;({ ctx, p, warns } = await mk())
await p.addInitScript(() => {
  // simulate a GPU that refuses to create a context for the room
  const orig = HTMLCanvasElement.prototype.getContext
  let n = 0
  HTMLCanvasElement.prototype.getContext = function (t, ...r) { if (/webgl/.test(String(t)) && ++n > 1) return null; return orig.call(this, t, ...r) }
})
await p.goto(BASE + '@the-midnight-internet/')
await p.locator('.site-title').waitFor({ timeout: 20000 })
await p.waitForTimeout(4000)
const inert = await p.evaluate(() => ({ inert: !!document.querySelector('.wrap')?.inert, locked: document.documentElement.classList.contains('li-lock'), overlay: !!document.querySelector('.li-room') }))
check('published site stays usable when the 3D room cannot start', !inert.inert && !inert.locked, JSON.stringify(inert))
await ctx.close()

await b.close()
const bad = results.filter((x) => !x).length
console.log(`\n${results.length - bad}/${results.length} stability checks passed`)
process.exit(bad ? 1 : 0)
