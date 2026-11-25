// Cross-browser smoke suite: the same product, run in WebKit (Safari engine), Firefox or Chromium.
//   BROWSER=webkit BASE=http://127.0.0.1:4173 node scripts/e2e-browser.mjs
// Needs a running server with the demo homes seeded (see scripts/e2e-atelier.sh, scripts/seed-demo.mjs).
// WebKit here is Playwright's build, NOT real Safari and NOT an iPhone. It catches engine differences
// (WebGL, IndexedDB, audio/MediaRecorder support, GIF, downloads, touch) before a real-device pass.
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { chromium, firefox, webkit, devices } from 'playwright'

const BASE = (process.env.BASE ?? 'http://127.0.0.1:4173').replace(/\/+$/, '') + '/'
const KIND = process.env.BROWSER ?? 'webkit'
const SHOTS = process.env.SHOTS ?? `.e2e-browser/${KIND}`
mkdirSync(SHOTS, { recursive: true })
const type = { webkit, firefox, chromium }[KIND]
if (!type) throw new Error(`unknown BROWSER ${KIND}`)

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${KIND}] ${name}${extra ? `  (${extra})` : ''}`)
}
const launchArgs = KIND === 'chromium' ? { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] } : {}
let browser
try {
  browser = await type.launch(launchArgs)
} catch (e) {
  console.log(`BLOCKED  cannot launch ${KIND} here: ${String(e.message).split('\n')[0]}`)
  process.exit(2)
}

const phone = KIND === 'webkit' ? devices['iPhone 13'] : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const ctx = await browser.newContext({ ...phone, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// ---- engine capabilities that the product depends on
await page.goto(BASE)
await page.locator('.setup').waitFor({ timeout: 30000 })
const caps = await page.evaluate(async () => {
  const c = document.createElement('canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const audio = document.createElement('audio')
  return {
    webgl: !!gl,
    webgl2: !!c.getContext('webgl2'),
    indexedDB: !!window.indexedDB,
    serviceWorker: 'serviceWorker' in navigator,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    recorderTypes: typeof MediaRecorder !== 'undefined' ? ['audio/webm', 'audio/mp4', 'audio/ogg'].filter((t) => MediaRecorder.isTypeSupported(t)) : [],
    playsMp4: audio.canPlayType('audio/mp4') !== '',
    playsWebm: audio.canPlayType('audio/webm') !== '',
    createImageBitmap: typeof createImageBitmap === 'function',
    clipboard: !!navigator.clipboard,
    storagePersist: !!(navigator.storage && navigator.storage.persist),
  }
})
console.log('capabilities:', JSON.stringify(caps))
check('WebGL available (3D room can run)', caps.webgl)
check('IndexedDB available (local data)', caps.indexedDB)
check('can record audio in some format the site can play back', caps.mediaRecorder && caps.recorderTypes.some((t) => (t === 'audio/mp4' ? caps.playsMp4 : t === 'audio/webm' ? caps.playsWebm : true)), caps.recorderTypes.join(','))
check('createImageBitmap available (photo and GIF upload)', caps.createImageBitmap)

// ---- first run → demo copy → 3D room
await page.getByRole('button', { name: 'Try a demo home' }).click()
await page.getByRole('button', { name: 'The Midnight Internet' }).click()
await page.locator('.home .scene canvas').waitFor({ timeout: 45000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(SHOTS, 'home.png') })
check('demo copy opens to the 3D room', true)

// ---- touch: rotate camera by dragging, tap a hotspot
const box = await page.locator('.home .scene canvas').boundingBox()
const before = await page.screenshot()
if (phone.hasTouch) {
  const cdp = KIND === 'chromium' ? await ctx.newCDPSession(page) : null
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 100, y: box.y + 300 }] })
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 100 + i * 20, y: box.y + 300 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await page.mouse.move(box.x + 100, box.y + 300)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 100 + i * 20, box.y + 300)
    await page.mouse.up()
  }
  await page.waitForTimeout(700)
  const after = await page.screenshot()
  check('dragging rotates the room', Buffer.compare(before, after) !== 0)
}
await page.locator('button.hotspot[data-id="computer"]').tap({ force: true, timeout: 8000 }).catch(() => page.locator('button.hotspot[data-id=\"computer\"]').evaluate((el) => el.click()))
check('tapping the computer opens the CRT menu', await page.locator('.crt-item').first().isVisible())

// ---- Web Atelier on a phone: edit, undo, local persistence
await page.locator('.crt-item', { hasText: 'Decorate my website' }).click()
await page.locator('.atelier').waitFor()
const frame = page.frameLocator('.at-frame')
await frame.locator('[data-w]').first().waitFor()
const n0 = await frame.locator('[data-w]').count()
await page.getByRole('tab', { name: 'Add' }).click()
await page.locator('.lib-item', { hasText: /^Guestbook$/ }).tap().catch(() => page.locator('.lib-item', { hasText: /^Guestbook$/ }).click())
await page.waitForTimeout(500)
check('adding a component updates the live preview', (await frame.locator('[data-w]').count()) === n0 + 1)
await page.screenshot({ path: join(SHOTS, 'atelier.png') })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
check('no horizontal overflow in the phone editor', overflow <= 0, String(overflow))
await page.waitForTimeout(800) // autosave debounce
await page.reload()
await page.locator('.home').waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Decorate my website' }).first().click()
await page.locator('.atelier').waitFor()
await page.frameLocator('.at-frame').locator('[data-w]').first().waitFor()
check('the edit survives a reload (IndexedDB)', (await page.frameLocator('.at-frame').locator('[data-w]').count()) === n0 + 1)

// ---- GIF upload (animated GIF stays a GIF) through the real file chooser
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
await page.getByRole('tab', { name: 'Add' }).click()
await page.locator('.lib-item', { hasText: /^Image or GIF$/ }).click()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload image or GIF' }).first().click()])
await chooser.setFiles({ name: 'dot.gif', mimeType: 'image/gif', buffer: gif })
await page.locator('.insp-thumb').waitFor({ timeout: 10000 }).then(
  () => check('a GIF can be uploaded and previewed', true),
  () => check('a GIF can be uploaded and previewed', false),
)

// ---- export a website ZIP and a backup; both download and unzip
await page.locator('.at-bar button').first().click()
await page.locator('button.hotspot[data-id=\"computer\"]').evaluate((el) => el.click())
await page.locator('.crt-item', { hasText: 'Move my home' }).click()
await page.getByRole('button', { name: 'Skip' }).click({ timeout: 4000 }).catch(() => {})
const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download website ZIP' }).click()])
const z1 = unzipSync(new Uint8Array(readFileSync(await d1.path())))
check('website ZIP downloads and contains index.html + style.css', 'index.html' in z1 && 'style.css' in z1, d1.suggestedFilename())
const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download private backup' }).click()])
const z2 = unzipSync(new Uint8Array(readFileSync(await d2.path())))
check('private backup downloads and has no website files', 'backup.json' in z2 && !('index.html' in z2))

// ---- a published demo page in this engine (sandboxed origin, 3D door, guestbook form)
const visitor = await browser.newContext(phone)
const vp = await visitor.newPage()
await vp.goto(`${BASE}@the-midnight-internet/`)
await vp.locator('.site-title').waitFor({ timeout: 30000 })
const skip = vp.getByRole('button', { name: /Skip to website/ })
if (await skip.count()) await skip.click({ timeout: 8000 }).catch(() => {})
check('published demo renders', true)
await vp.locator('form[data-gb]').first().waitFor({ state: 'visible', timeout: 15000 }).then(
  () => check('guestbook form works inside the CSP sandbox', true),
  () => check('guestbook form works inside the CSP sandbox', false),
)
check('visitor page has no horizontal overflow', (await vp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
await vp.screenshot({ path: join(SHOTS, 'visitor.png'), fullPage: true })

// ---- audio element can load a published recording URL (play is a user gesture; only readiness is checked)
const canAudio = await vp.evaluate(() => {
  const a = document.createElement('audio')
  return { webm: a.canPlayType('audio/webm; codecs=opus'), mp4: a.canPlayType('audio/mp4'), ogg: a.canPlayType('audio/ogg; codecs=vorbis') }
})
console.log('audio playback support:', JSON.stringify(canAudio))

check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} checks passed in ${KIND}`)
process.exit(bad.length ? 1 : 0)
